import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey

from app.db.base import Base


class Dispatch(Base):
    __tablename__ = "dispatches"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by = Column(String, nullable=False)
    assigned_worker_id = Column(String, nullable=False)
    building_id = Column(String, ForeignKey("buildings.id"), nullable=False)
    shift_id = Column(String, ForeignKey("shifts.id"), nullable=True)

    title = Column(String, nullable=False)
    issue_text = Column(String, nullable=False)
    priority = Column(Integer, nullable=False, default=1)

    status = Column(String, nullable=False, default="pending")

    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    ringing_at = Column(DateTime(timezone=True), nullable=True)
    responded_at = Column(DateTime(timezone=True), nullable=True)
