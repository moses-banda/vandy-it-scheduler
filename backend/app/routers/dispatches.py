from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

NASHVILLE = ZoneInfo("America/Chicago")

from app.db.session import get_db
from app.db.models.dispatch import Dispatch
from app.schemas.dispatch import DispatchCreate, DispatchOut, DispatchAssign
from app.services.dispatch_service import (
    create_dispatch,
    start_ringing,
    respond_to_dispatch,
    reassign_dispatch,
    mark_dispatch_missed,
    cancel_dispatch,
    get_dispatch_summary,
)
from app.core.dependencies import get_current_user, require_manager
from app.db.models.user import User

router = APIRouter(prefix="/dispatches", tags=["dispatches"])


@router.post("", response_model=DispatchOut)
async def create(
    payload: DispatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return await create_dispatch(payload, db)


@router.get("", response_model=list[DispatchOut])
async def list_dispatches(
    date: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if date:
        target = datetime.strptime(date, "%Y-%m-%d").date()
        start = datetime.combine(target, datetime.min.time(), tzinfo=NASHVILLE)
        end = datetime.combine(target + timedelta(days=1), datetime.min.time(), tzinfo=NASHVILLE)
        result = await db.execute(
            select(Dispatch).where(
                Dispatch.created_at >= start,
                Dispatch.created_at < end,
            )
        )
    else:
        result = await db.execute(select(Dispatch))
    return result.scalars().all()


@router.get("/{dispatch_id}", response_model=DispatchOut)
async def get_dispatch(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Dispatch).where(Dispatch.id == dispatch_id))
    dispatch = result.scalar_one_or_none()
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    return dispatch


@router.post("/{dispatch_id}/ring")
async def ring(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    from app.services.call_service import initiate_call
    result = await initiate_call(dispatch_id, db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{dispatch_id}/accept", response_model=DispatchOut)
async def accept(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await respond_to_dispatch(dispatch_id, accepted=True, db=db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{dispatch_id}/decline", response_model=DispatchOut)
async def decline(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await respond_to_dispatch(dispatch_id, accepted=False, db=db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{dispatch_id}/reassign", response_model=DispatchOut)
async def reassign(
    dispatch_id: str,
    payload: DispatchAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await reassign_dispatch(dispatch_id, payload.assigned_worker_id, db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{dispatch_id}/missed", response_model=DispatchOut)
async def missed(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await mark_dispatch_missed(dispatch_id, db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{dispatch_id}/cancel", response_model=DispatchOut)
async def cancel(
    dispatch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await cancel_dispatch(dispatch_id, db)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/summary/{date}")
async def summary(
    date: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return await get_dispatch_summary(date, db)
