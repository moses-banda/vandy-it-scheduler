from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.dashboard import DashboardCoverageResponse
from app.services.dashboard_service import get_coverage
from app.core.dependencies import require_manager
from app.db.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/coverage", response_model=DashboardCoverageResponse)
async def coverage(
    date: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return await get_coverage(date, db)
