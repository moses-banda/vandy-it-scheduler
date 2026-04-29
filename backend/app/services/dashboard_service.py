from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

NASHVILLE = ZoneInfo("America/Chicago")

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.shift import Shift
from app.db.models.building import Building
from app.db.models.checkin import CheckIn


async def get_coverage(date_str: str, db: AsyncSession):
    """
    For a given date, return every shift with its current state:
      green  = checked in
      orange = scheduled, window still open, not checked in
      red    = window closed, not checked in
      gray   = shift hasn't started yet
    """

    # Parse date
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()

    # Use Nashville midnight boundaries so "today" matches Nashville's calendar day
    start_boundary = datetime.combine(target_date, datetime.min.time(), tzinfo=NASHVILLE)
    end_boundary = datetime.combine(target_date + timedelta(days=1), datetime.min.time(), tzinfo=NASHVILLE)

    # Get all shifts for that date
    result = await db.execute(
        select(Shift).where(
            and_(
                Shift.start_time >= start_boundary,
                Shift.start_time < end_boundary,
            )
        )
    )
    shifts = result.scalars().all()

    now = datetime.now(timezone.utc)
    slots = []

    for shift in shifts:
        # Get building name
        bld_result = await db.execute(
            select(Building).where(Building.id == shift.building_id)
        )
        building = bld_result.scalar_one_or_none()
        building_name = building.name if building else "Unknown"

        # Check if there is an approved check-in
        ci_result = await db.execute(
            select(CheckIn).where(
                and_(
                    CheckIn.shift_id == shift.id,
                    CheckIn.status == "approved",
                )
            )
        )
        approved_checkin = ci_result.scalar_one_or_none()

        # Determine state
        if approved_checkin or shift.status == "checked_in":
            state = "green"
            checked_in = True
        elif shift.checkin_close_time:
            # Ensure DB object has tzinfo
            close_time = shift.checkin_close_time if shift.checkin_close_time.tzinfo else shift.checkin_close_time.replace(tzinfo=timezone.utc)
            if now > close_time:
                state = "red"
                checked_in = False
            else:
                state = "orange"
                checked_in = False
        elif shift.checkin_open_time and shift.checkin_open_time:
            open_time = shift.checkin_open_time if shift.checkin_open_time.tzinfo else shift.checkin_open_time.replace(tzinfo=timezone.utc)
            if now >= open_time:
                state = "orange"
                checked_in = False
            else:
                 state = "gray"
                 checked_in = False
        else:
            state = "gray"
            checked_in = False

        slots.append({
            "shift_id": shift.id,
            "worker_id": shift.worker_id,
            "building_id": shift.building_id,
            "building_name": building_name,
            "start_time": shift.start_time,
            "end_time": shift.end_time,
            "checkin_open_time": shift.checkin_open_time,
            "checkin_close_time": shift.checkin_close_time,
            "checkin_time": approved_checkin.attempt_time if approved_checkin else None,
            "state": state,
            "checked_in": checked_in,
        })

    return {"date": date_str, "slots": slots}
