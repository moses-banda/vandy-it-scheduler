import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey

from app.db.base import Base


class CallSession(Base):
    __tablename__ = "call_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dispatch_id = Column(String, ForeignKey("dispatches.id"), nullable=False)
    worker_id = Column(String, nullable=False)

    status = Column(String, nullable=False, default="ringing")

    audio_file_path = Column(String, nullable=True)

    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    connected_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
