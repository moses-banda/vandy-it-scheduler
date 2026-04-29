import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Float, Boolean, ForeignKey

from app.db.base import Base


class CheckIn(Base):
    __tablename__ = "checkins"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shift_id = Column(String, ForeignKey("shifts.id"), nullable=False)
    worker_id = Column(String, nullable=False)
    building_id = Column(String, nullable=False)

    attempt_time = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)

    location_verified = Column(Boolean, nullable=False, default=False)
    time_verified = Column(Boolean, nullable=False, default=False)

    status = Column(String, nullable=False, default="denied")
    reason = Column(String, nullable=True)
