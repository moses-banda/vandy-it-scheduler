from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


CoverageState = Literal["green", "orange", "red", "gray"]


class CoverageSlot(BaseModel):
    shift_id: str
    worker_id: str
    building_id: str
    building_name: str
    start_time: datetime
    end_time: datetime
    state: CoverageState
    checked_in: bool

    model_config = ConfigDict(from_attributes=True)


class DashboardCoverageResponse(BaseModel):
    date: str
    slots: list[CoverageSlot]
