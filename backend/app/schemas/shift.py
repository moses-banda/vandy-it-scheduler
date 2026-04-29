from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

class ShiftCreate(BaseModel):
    worker_id: str
    building_id: str
    start_time: datetime
    end_time: datetime
    checkin_open_time: Optional[datetime] = None
    checkin_close_time: Optional[datetime] = None


class ShiftUpdate(BaseModel):
    building_id: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    checkin_open_time: Optional[datetime] = None
    checkin_close_time: Optional[datetime] = None


class ShiftOut(ShiftCreate):
    id: str
    status: str

    model_config = ConfigDict(from_attributes=True)