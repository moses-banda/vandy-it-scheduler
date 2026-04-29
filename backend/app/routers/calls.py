from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import os

from app.db.session import get_db
from app.db.models.call_session import CallSession
from app.db.models.user import User
from app.core.dependencies import get_current_user, require_manager
from app.services.call_service import (
    initiate_call,
    answer_call,
    end_call,
    fail_call,
)

router = APIRouter(prefix="/calls", tags=["calls"])


class CallAnswerRequest(BaseModel):
    sdp_offer: Optional[str] = None


class CallFailRequest(BaseModel):
    reason: str = "unknown"


@router.get("")
async def list_my_calls(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CallSession)
        .where(CallSession.worker_id == current_user.id)
        .order_by(CallSession.started_at.desc())
    )
    calls = result.scalars().all()
    return [
        {
            "call_id": c.id,
            "dispatch_id": c.dispatch_id,
            "status": c.status,
            "started_at": c.started_at,
            "connected_at": c.connected_at,
            "ended_at": c.ended_at,
        }
        for c in calls
    ]


@router.post("/{dispatch_id}/ring")
async def ring_worker(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await initiate_call(dispatch_id, db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{call_id}/answer")
async def worker_answers(
    call_id: str,
    payload: CallAnswerRequest = CallAnswerRequest(),
    db: AsyncSession = Depends(get_db),
):
    result = await answer_call(call_id, payload.sdp_offer, db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{call_id}/end")
async def call_ended(call_id: str, db: AsyncSession = Depends(get_db)):
    result = await end_call(call_id, db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{call_id}/fail")
async def call_failed(
    call_id: str,
    payload: CallFailRequest = CallFailRequest(),
    db: AsyncSession = Depends(get_db),
):
    result = await fail_call(call_id, payload.reason, db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/{call_id}/audio")
async def get_audio(call_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CallSession).where(CallSession.id == call_id)
    )
    call = result.scalar_one_or_none()

    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    if not call.audio_file_path or not os.path.exists(call.audio_file_path):
        raise HTTPException(status_code=404, detail="Audio not available")

    return FileResponse(
        call.audio_file_path,
        media_type="audio/wav",
        filename="dispatch_message.wav",
    )


@router.get("/{call_id}/status")
async def call_status(call_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CallSession).where(CallSession.id == call_id)
    )
    call = result.scalar_one_or_none()

    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    return {
        "call_id": call.id,
        "dispatch_id": call.dispatch_id,
        "worker_id": call.worker_id,
        "status": call.status,
        "started_at": call.started_at,
        "connected_at": call.connected_at,
        "ended_at": call.ended_at,
    }
