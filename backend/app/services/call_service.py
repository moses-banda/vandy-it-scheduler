import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.dispatch import Dispatch
from app.db.models.building import Building
from app.db.models.call_session import CallSession
from app.services.voice_agent import (
    generate_dispatch_message,
    generate_audio,
    cleanup_audio,
)
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)


async def initiate_call(dispatch_id: str, db: AsyncSession):
    result = await db.execute(
        select(Dispatch)
        .where(Dispatch.id == dispatch_id)
        .with_for_update()
    )
    dispatch = result.scalar_one_or_none()

    if not dispatch:
        return {"error": "Dispatch not found"}

    if dispatch.status not in ("pending", "missed", "declined"):
        return {"error": f"Cannot call from status '{dispatch.status}'"}

    bld_result = await db.execute(
        select(Building).where(Building.id == dispatch.building_id)
    )
    building = bld_result.scalar_one_or_none()
    building_name = building.name if building else "unknown location"

    spoken_text = generate_dispatch_message(building_name, dispatch.issue_text)
    audio_path = generate_audio(spoken_text)

    now = datetime.now(timezone.utc)
    dispatch.status = "ringing"
    dispatch.ringing_at = now

    call = CallSession(
        dispatch_id=dispatch.id,
        worker_id=dispatch.assigned_worker_id,
        status="ringing",
        audio_file_path=audio_path,
        started_at=now,
    )

    db.add(call)
    await db.commit()
    await db.refresh(call)
    await db.refresh(dispatch)

    await manager.send_to_user(dispatch.assigned_worker_id, {
        "event": "call.incoming",
        "call_id": call.id,
        "dispatch_id": dispatch.id,
        "building_name": building_name,
        "title": dispatch.title,
        "spoken_message": spoken_text,
        "caller_id": dispatch.created_by,
    })

    await manager.broadcast({
        "event": "dispatch.status_changed",
        "dispatch_id": dispatch.id,
        "status": "ringing",
        "assigned_worker_id": dispatch.assigned_worker_id,
    })

    logger.info(
        f"Call initiated: dispatch {dispatch.id} "
        f"worker {dispatch.assigned_worker_id} "
        f"call {call.id}"
    )

    return {
        "call_id": call.id,
        "dispatch_id": dispatch.id,
        "status": "ringing",
        "spoken_message": spoken_text,
    }


async def answer_call(call_id: str, sdp_offer: str, db: AsyncSession):
    result = await db.execute(
        select(CallSession)
        .where(CallSession.id == call_id)
        .with_for_update()
    )
    call = result.scalar_one_or_none()

    if not call:
        return {"error": "Call not found"}

    if call.status != "ringing":
        return {"error": f"Cannot answer from status '{call.status}'"}

    now = datetime.now(timezone.utc)
    call.status = "connected"
    call.connected_at = now

    # Mark dispatch as answered so manager sees instant status change
    disp_result = await db.execute(
        select(Dispatch)
        .where(Dispatch.id == call.dispatch_id)
        .with_for_update()
    )
    dispatch = disp_result.scalar_one_or_none()
    if dispatch and dispatch.status == "ringing":
        dispatch.status = "answered"

    await db.commit()
    await db.refresh(call)

    await manager.broadcast({
        "event": "call.connected",
        "call_id": call.id,
        "dispatch_id": call.dispatch_id,
        "worker_id": call.worker_id,
    })

    # Separate dispatch.status_changed so manager panel badge updates instantly
    if dispatch:
        await manager.broadcast({
            "event": "dispatch.status_changed",
            "dispatch_id": call.dispatch_id,
            "status": "answered",
            "assigned_worker_id": call.worker_id,
        })

    logger.info(f"Call answered: {call.id} worker {call.worker_id}")

    return {
        "call_id": call.id,
        "status": "connected",
        "audio_file": call.audio_file_path,
    }


async def end_call(call_id: str, db: AsyncSession):
    result = await db.execute(
        select(CallSession)
        .where(CallSession.id == call_id)
        .with_for_update()
    )
    call = result.scalar_one_or_none()

    if not call:
        return {"error": "Call not found"}

    now = datetime.now(timezone.utc)
    call.status = "ended"
    call.ended_at = now

    # If dispatch is still "answered" (worker hung up without accepting/declining),
    # fall back to missed so the manager sees a clear terminal state
    disp_result = await db.execute(
        select(Dispatch)
        .where(Dispatch.id == call.dispatch_id)
        .with_for_update()
    )
    dispatch = disp_result.scalar_one_or_none()
    leftover_status = None
    if dispatch and dispatch.status == "answered":
        dispatch.status = "missed"
        dispatch.responded_at = now
        leftover_status = "missed"

    await db.commit()
    await db.refresh(call)

    cleanup_audio(call.audio_file_path)

    await manager.broadcast({
        "event": "call.ended",
        "call_id": call.id,
        "dispatch_id": call.dispatch_id,
        "worker_id": call.worker_id,
    })

    if leftover_status and dispatch:
        await manager.broadcast({
            "event": "dispatch.status_changed",
            "dispatch_id": call.dispatch_id,
            "status": leftover_status,
            "assigned_worker_id": call.worker_id,
        })

    logger.info(f"Call ended: {call.id}")

    return {"call_id": call.id, "status": "ended"}


async def fail_call(call_id: str, reason: str, db: AsyncSession):
    result = await db.execute(
        select(CallSession)
        .where(CallSession.id == call_id)
        .with_for_update()
    )
    call = result.scalar_one_or_none()

    if not call:
        return {"error": "Call not found"}

    now = datetime.now(timezone.utc)
    call.status = "failed"
    call.ended_at = now

    await db.commit()
    await db.refresh(call)

    cleanup_audio(call.audio_file_path)

    await manager.broadcast({
        "event": "call.failed",
        "call_id": call.id,
        "dispatch_id": call.dispatch_id,
        "worker_id": call.worker_id,
        "reason": reason,
    })

    logger.info(f"Call failed: {call.id} reason: {reason}")

    return {"call_id": call.id, "status": "failed", "reason": reason}
