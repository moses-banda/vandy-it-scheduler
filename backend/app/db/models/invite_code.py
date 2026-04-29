from sqlalchemy import Column, String, Boolean, DateTime
from app.db.base import Base
import uuid
from datetime import datetime, timezone


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, unique=True, nullable=False)
    created_by = Column(String, nullable=False)  # manager user id
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    used = Column(Boolean, default=False)
    used_by = Column(String, nullable=True)  # worker user id who redeemed it
    used_at = Column(DateTime(timezone=True), nullable=True)
