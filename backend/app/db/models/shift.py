from sqlalchemy import Column, String, DateTime, ForeignKey
from app.db.base import Base
import uuid

class Shift(Base):
    __tablename__ = "shifts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    worker_id = Column(String, nullable=False)
    building_id = Column(String, ForeignKey("buildings.id"), nullable=False)

    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    checkin_open_time = Column(DateTime(timezone=True), nullable=True)
    checkin_close_time = Column(DateTime(timezone=True), nullable=True)


    status = Column(String, default="scheduled")