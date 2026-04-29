from pydantic import BaseModel, ConfigDict

class BuildingCreate(BaseModel):
    name: str
    address: str
    lat: float
    lng: float
    radius_meters: int = 75


class BuildingOut(BuildingCreate):
    id: str

    model_config = ConfigDict(from_attributes=True)