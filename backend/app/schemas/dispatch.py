from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict


DispatchStatus = Literal[
    "pending", "ringing", "answered", "accepted", "declined", "missed", "expired"
]


class DispatchCreate(BaseModel):
    created_by: str
    assigned_worker_id: str
    building_id: str
    shift_id: Optional[str] = None
    title: str
    issue_text: str
    priority: int = 1


class DispatchAssign(BaseModel):
    assigned_worker_id: str
    reason: Optional[str] = None


class DispatchOut(BaseModel):
    id: str
    created_by: str
    assigned_worker_id: str
    building_id: str
    shift_id: Optional[str] = None
    title: str
    issue_text: str
    priority: int
    status: str
    created_at: datetime
    ringing_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DispatchStatusUpdate(BaseModel):
    status: DispatchStatus
