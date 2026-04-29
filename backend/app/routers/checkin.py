from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.schemas.checkin import CheckInRequest, CheckInResponse
from app.services.checkin_service import process_checkin
from app.core.dependencies import get_current_user, require_manager
from app.db.models.user import User
from app.db.models.building import Building
from app.utils.geolocation import haversine_distance_meters

router = APIRouter(prefix="/checkin", tags=["checkin"])


@router.post("", response_model=CheckInResponse)
async def checkin(
    payload: CheckInRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Override worker_id with the authenticated user
    payload.worker_id = current_user.id
    return await process_checkin(payload, db)


@router.get("/test-location")
async def test_location(
    building_id: str = Query(..., description="Building ID to test against"),
    lat: float = Query(..., description="Latitude to test"),
    lng: float = Query(..., description="Longitude to test"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """
    Manager-only: verify whether a coordinate falls within a building's geofence.
    Returns distance, radius, and pass/fail — without creating any check-in record.
    """
    result = await db.execute(select(Building).where(Building.id == building_id))
    building = result.scalar_one_or_none()
    if not building:
        return {"error": "Building not found"}

    distance = round(haversine_distance_meters(lat, lng, building.lat, building.lng), 2)
    radius = building.radius_meters if building.radius_meters is not None else 60

    return {
        "building": building.name,
        "building_center": {"lat": building.lat, "lng": building.lng},
        "test_point": {"lat": lat, "lng": lng},
        "distance_m": distance,
        "radius_m": radius,
        "within_geofence": distance <= radius,
    }