from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models.shift import Shift
from app.db.models.building import Building
from app.schemas.shift import ShiftCreate, ShiftUpdate, ShiftOut
from app.core.dependencies import get_current_user, require_manager
from app.db.models.user import User
from app.services.websocket_manager import manager as ws_manager

router = APIRouter(prefix="/shifts", tags=["shifts"])


@router.post("", response_model=ShiftOut)
async def create_shift(
    payload: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    shift = Shift(**payload.model_dump())
    db.add(shift)
    await db.commit()
    await db.refresh(shift)

    # Fetch building name for the notification
    bld_result = await db.execute(select(Building).where(Building.id == shift.building_id))
    building = bld_result.scalar_one_or_none()

    # Notify the assigned worker so their dashboard refreshes immediately
    await ws_manager.send_to_user(shift.worker_id, {
        "event": "shift.scheduled",
        "shift_id": shift.id,
        "building_name": building.name if building else "",
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
    })

    return shift


@router.get("", response_model=list[ShiftOut])
async def list_shifts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Shift))
    return result.scalars().all()


@router.patch("/{shift_id}", response_model=ShiftOut)
async def update_shift(
    shift_id: str,
    payload: ShiftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(shift, key, value)

    await db.commit()
    await db.refresh(shift)

    bld_result = await db.execute(select(Building).where(Building.id == shift.building_id))
    building = bld_result.scalar_one_or_none()

    await ws_manager.send_to_user(shift.worker_id, {
        "event": "shift.updated",
        "shift_id": shift.id,
        "building_name": building.name if building else "",
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
    })

    return shift


@router.delete("/{shift_id}")
async def cancel_shift(
    shift_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Mark cancelled instead of hard-deleting so the student gets an accurate
    # re-fetch even if they missed the WS event
    bld_result = await db.execute(select(Building).where(Building.id == shift.building_id))
    building = bld_result.scalar_one_or_none()

    shift.status = "cancelled"
    await db.commit()

    await ws_manager.send_to_user(shift.worker_id, {
        "event": "shift.cancelled",
        "shift_id": shift_id,
        "building_name": building.name if building else "",
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
    })

    return {"detail": "Shift cancelled"}