from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.building import Building
from app.db.models.checkin import CheckIn
from app.db.models.shift import Shift
from app.utils.geolocation import haversine_distance_meters


async def process_checkin(payload, db: AsyncSession):
    # 1) Load shift
    shift_result = await db.execute(
        select(Shift).where(Shift.id == payload.shift_id)
    )
    shift = shift_result.scalar_one_or_none()

    if not shift:
        return {"status": "denied", "reason": "Shift not found"}

    # 2) Verify correct worker
    if shift.worker_id != payload.worker_id:
        return {"status": "denied", "reason": "Not assigned to this shift"}

    # 3) Prevent duplicate check-in
    if shift.status == "checked_in":
        return {"status": "denied", "reason": "Already checked in"}

    # 4) Load building
    building_result = await db.execute(
        select(Building).where(Building.id == shift.building_id)
    )
    building = building_result.scalar_one_or_none()

    if not building:
        return {"status": "denied", "reason": "Building not found"}

    # 5) Time validation
    now = datetime.now(timezone.utc)

    if shift.checkin_open_time:
        open_time = shift.checkin_open_time if shift.checkin_open_time.tzinfo else shift.checkin_open_time.replace(tzinfo=timezone.utc)
        if now < open_time:
            return {"status": "denied", "reason": "Too early"}

    if shift.checkin_close_time:
        close_time = shift.checkin_close_time if shift.checkin_close_time.tzinfo else shift.checkin_close_time.replace(tzinfo=timezone.utc)
        if now > close_time:
            return {"status": "denied", "reason": "Check-in window closed"}

    time_verified = True

    # 6) Location validation
    distance = haversine_distance_meters(
        payload.lat,
        payload.lng,
        building.lat,
        building.lng,
    )

    radius = building.radius_meters if building.radius_meters is not None else 75
    location_verified = distance <= radius

    if not location_verified:
        return {
            "status": "denied",
            "reason": f"Not at the correct location — you are {round(distance)}m away (limit {radius}m)",
        }

    # 7) Save check-in
    checkin = CheckIn(
        shift_id=shift.id,
        worker_id=payload.worker_id,
        building_id=building.id,
        attempt_time=now,
        lat=payload.lat,
        lng=payload.lng,
        location_verified=location_verified,
        time_verified=time_verified,
        status="approved",
        reason=None,
    )

    shift.status = "checked_in"

    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)

    # 8) Notify dashboard via websocket
    from app.services.websocket_manager import manager

    await manager.broadcast({
        "event": "checkin.approved",
        "shift_id": shift.id,
        "worker_id": payload.worker_id,
        "building_id": building.id,
        "building_name": building.name,
    })

    return {"status": "approved", "reason": None}