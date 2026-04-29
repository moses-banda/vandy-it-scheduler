from datetime import datetime, timezone
from zoneinfo import ZoneInfo

NASHVILLE = ZoneInfo("America/Chicago")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.dispatch import Dispatch
from app.db.models.building import Building
from app.services.websocket_manager import manager


async def create_dispatch(payload, db: AsyncSession):
    dispatch = Dispatch(
        created_by=payload.created_by,
        assigned_worker_id=payload.assigned_worker_id,
        building_id=payload.building_id,
        shift_id=payload.shift_id,
        title=payload.title,
        issue_text=payload.issue_text,
        priority=payload.priority,
        status="pending",
    )

    db.add(dispatch)
    await db.commit()
    await db.refresh(dispatch)

    return dispatch


async def start_ringing(dispatch_id: str, db: AsyncSession):
    result = await db.execute(
        select(Dispatch)
        .where(Dispatch.id == dispatch_id)
        .with_for_update()
    )
    dispatch = result.scalar_one_or_none()

    if not dispatch:
        return {"error": "Dispatch not found"}

    if dispatch.status not in ("pending",):
        return {"error": f"Cannot ring from status '{dispatch.status}'"}

    now = datetime.now(timezone.utc)
    dispatch.status = "ringing"
    dispatch.ringing_at = now

    await db.commit()
    await db.refresh(dispatch)

    bld_result = await db.execute(
        select(Building).where(Building.id == dispatch.building_id)
    )
    building = bld_result.scalar_one_or_none()
    building_name = building.name if building else "unknown location"

    spoken_message = (
        f"You have a dispatch at {building_name}. {dispatch.issue_text}"
    )

    await manager.send_to_user(dispatch.assigned_worker_id, {
        "event": "dispatch.ringing",
        "dispatch_id": dispatch.id,
        "building_name": building_name,
        "title": dispatch.title,
        "issue_text": dispatch.issue_text,
        "spoken_message": spoken_message,
    })

    await manager.broadcast({
        "event": "dispatch.status_changed",
        "dispatch_id": dispatch.id,
        "status": "ringing",
        "assigned_worker_id": dispatch.assigned_worker_id,
    })

    return dispatch


async def respond_to_dispatch(dispatch_id: str, accepted: bool, db: AsyncSession):
    result = await db.execute(
        select(Dispatch)
        .where(Dispatch.id == dispatch_id)
        .with_for_update()
    )
    dispatch = result.scalar_one_or_none()

    if not dispatch:
        return {"error": "Dispatch not found"}

    if dispatch.status not in ("ringing", "answered"):
        return {"error": f"Cannot respond from status '{dispatch.status}'"}

    now = datetime.now(timezone.utc)
    dispatch.status = "accepted" if accepted else "declined"
    dispatch.responded_at = now

    await db.commit()
    await db.refresh(dispatch)

    await manager.broadcast({
        "event": "dispatch.status_changed",
        "dispatch_id": dispatch.id,
        "status": dispatch.status,
        "assigned_worker_id": dispatch.assigned_worker_id,
    })

    return dispatch


async def reassign_dispatch(dispatch_id: str, new_worker_id: str, db: AsyncSession):
    result = await db.execute(
        select(Dispatch)
        .where(Dispatch.id == dispatch_id)
        .with_for_update()
    )
    dispatch = result.scalar_one_or_none()

    if not dispatch:
        return {"error": "Dispatch not found"}

    old_worker_id = dispatch.assigned_worker_id
    dispatch.assigned_worker_id = new_worker_id
    dispatch.status = "pending"
    dispatch.ringing_at = None
    dispatch.responded_at = None

    await db.commit()
    await db.refresh(dispatch)

    await manager.send_to_user(old_worker_id, {
        "event": "dispatch.reassigned",
        "dispatch_id": dispatch.id,
        "message": "This dispatch has been reassigned.",
    })

    await manager.broadcast({
        "event": "dispatch.status_changed",
        "dispatch_id": dispatch.id,
        "status": "pending",
        "assigned_worker_id": new_worker_id,
    })

    return dispatch


async def mark_dispatch_missed(dispatch_id: str, db: AsyncSession):
    result = await db.execute(
        select(Dispatch)
        .where(Dispatch.id == dispatch_id)
        .with_for_update()
    )
    dispatch = result.scalar_one_or_none()

    if not dispatch:
        return {"error": "Dispatch not found"}

    if dispatch.status != "ringing":
        return {"error": f"Cannot mark missed from status '{dispatch.status}'"}

    now = datetime.now(timezone.utc)
    dispatch.status = "missed"
    dispatch.responded_at = now

    await db.commit()
    await db.refresh(dispatch)

    await manager.broadcast({
        "event": "dispatch.status_changed",
        "dispatch_id": dispatch.id,
        "status": "missed",
        "assigned_worker_id": dispatch.assigned_worker_id,
    })

    return dispatch


async def cancel_dispatch(dispatch_id: str, db: AsyncSession):
    result = await db.execute(
        select(Dispatch)
        .where(Dispatch.id == dispatch_id)
        .with_for_update()
    )
    dispatch = result.scalar_one_or_none()

    if not dispatch:
        return {"error": "Dispatch not found"}

    if dispatch.status in ("accepted",):
        return {"error": "Cannot cancel an accepted dispatch"}

    dispatch.status = "expired"

    await db.commit()
    await db.refresh(dispatch)

    await manager.send_to_user(dispatch.assigned_worker_id, {
        "event": "dispatch.cancelled",
        "dispatch_id": dispatch.id,
    })

    await manager.broadcast({
        "event": "dispatch.status_changed",
        "dispatch_id": dispatch.id,
        "status": "expired",
        "assigned_worker_id": dispatch.assigned_worker_id,
    })

    return dispatch


async def get_dispatch_summary(date_str: str, db: AsyncSession):
    from datetime import datetime as dt, timedelta, timezone

    target_date = dt.strptime(date_str, "%Y-%m-%d").date()
    start = dt.combine(target_date, dt.min.time(), tzinfo=NASHVILLE)
    end = dt.combine(target_date + timedelta(days=1), dt.min.time(), tzinfo=NASHVILLE)

    result = await db.execute(
        select(Dispatch).where(
            Dispatch.created_at >= start,
            Dispatch.created_at < end,
        )
    )
    dispatches = result.scalars().all()

    summary = []
    for d in dispatches:
        if d.status == "accepted":
            color = "green"
        elif d.status in ("declined", "missed", "expired"):
            color = "red"
        elif d.status == "ringing":
            color = "yellow"
        else:
            color = "gray"

        summary.append({
            "dispatch_id": d.id,
            "title": d.title,
            "assigned_worker_id": d.assigned_worker_id,
            "building_id": d.building_id,
            "status": d.status,
            "color": color,
            "created_at": d.created_at,
            "responded_at": d.responded_at,
        })

    return {"date": date_str, "dispatches": summary}
