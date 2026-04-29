from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models.user import User
from app.db.models.shift import Shift
from app.db.models.dispatch import Dispatch
from app.schemas.user import UserOut, UserUpdate
from app.core.dependencies import require_manager

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/worker-stats")
async def worker_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """
    Per-worker attendance + dispatch answer stats, sorted A-Z.
    Attendance  = (checked_in + completed) / (checked_in + completed + missed)
    Answer rate = (accepted + answered) / all resolved dispatches
    """
    workers_res  = await db.execute(select(User).where(User.role == "worker").order_by(User.name))
    shifts_res   = await db.execute(select(Shift).where(Shift.status.in_(["checked_in", "completed", "missed"])))
    dispatch_res = await db.execute(select(Dispatch).where(Dispatch.status.notin_(["pending", "ringing", "cancelled"])))

    workers   = workers_res.scalars().all()
    shifts    = shifts_res.scalars().all()
    dispatches = dispatch_res.scalars().all()

    stats = []
    for w in workers:
        ws = [s for s in shifts if s.worker_id == w.id]
        wd = [d for d in dispatches if d.assigned_worker_id == w.id]

        attended  = sum(1 for s in ws if s.status in ("checked_in", "completed"))
        answered  = sum(1 for d in wd if d.status in ("accepted", "answered"))

        stats.append({
            "id":                  w.id,
            "name":                w.name,
            "email":               w.email,
            "is_active":           w.is_active,
            "shifts_total":        len(ws),
            "shifts_attended":     attended,
            "attendance_pct":      round(attended / len(ws) * 100) if ws else None,
            "dispatches_total":    len(wd),
            "dispatches_answered": answered,
            "answer_pct":          round(answered / len(wd) * 100) if wd else None,
        })
    return stats


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(User))
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    await db.commit()

    return {"detail": "User deactivated"}
