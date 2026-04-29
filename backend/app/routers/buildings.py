from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models.building import Building
from app.schemas.building import BuildingCreate, BuildingOut
from app.core.dependencies import get_current_user, require_manager
from app.db.models.user import User

router = APIRouter(prefix="/buildings", tags=["buildings"])

@router.post("", response_model=BuildingOut)
async def create_building(
    payload: BuildingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    building = Building(**payload.model_dump())
    db.add(building)
    await db.commit()
    await db.refresh(building)
    return building


@router.get("", response_model=list[BuildingOut])
async def list_buildings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Building))
    buildings = result.scalars().all()
    return buildings

@router.delete("/{building_id}")
async def delete_building(
    building_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Building).where(Building.id == building_id))
    building = result.scalar_one_or_none()
    if building:
        await db.delete(building)
        await db.commit()
    return {"status": "deleted"}