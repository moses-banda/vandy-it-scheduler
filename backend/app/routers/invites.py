import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models.invite_code import InviteCode
from app.core.dependencies import require_manager
from app.db.models.user import User


router = APIRouter(prefix="/invites", tags=["invites"])


class InviteOut(BaseModel):
    id: str
    code: str
    created_at: datetime
    used: bool
    used_by: str | None = None


@router.post("", response_model=InviteOut)
async def generate_invite(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Manager generates a one-time invite code."""
    code = secrets.token_urlsafe(8)  # short, copy-pasteable code
    invite = InviteCode(
        code=code,
        created_by=current_user.id,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return invite


@router.get("", response_model=list[InviteOut])
async def list_invites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Manager sees all invite codes they've generated."""
    result = await db.execute(
        select(InviteCode).where(InviteCode.created_by == current_user.id)
    )
    return result.scalars().all()
