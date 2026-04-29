from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.db.models.user import User
from app.db.models.invite_code import InviteCode
from app.core.security import hash_password, verify_password, create_access_token


async def register_user(payload, db: AsyncSession):
    # 1. Validate invite code
    invite_result = await db.execute(
        select(InviteCode).where(InviteCode.code == payload.invite_code)
    )
    invite = invite_result.scalar_one_or_none()

    if not invite:
        return {"error": "Invalid invite code"}

    if invite.used:
        return {"error": "This invite code has already been used"}

    # 2. Check email not taken
    result = await db.execute(
        select(User).where(User.email == payload.email)
    )
    existing = result.scalar_one_or_none()

    if existing:
        return {"error": "Email already registered"}

    # 3. Create user
    user = User(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )

    db.add(user)
    await db.flush()  # get user.id before committing

    # 4. Mark invite as used
    invite.used = True
    invite.used_by = user.id
    invite.used_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)

    return user


async def authenticate_user(email: str, password: str, db: AsyncSession):
    result = await db.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if not user:
        return None

    if not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user


def create_token_for_user(user) -> dict:
    token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }
