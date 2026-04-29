from pydantic import BaseModel, ConfigDict


class CheckInRequest(BaseModel):
    worker_id: str
    shift_id: str
    lat: float
    lng: float


class CheckInResponse(BaseModel):
    status: str
    reason: str | None = None

    model_config = ConfigDict(from_attributes=True)
