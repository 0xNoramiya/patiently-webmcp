import uuid
from datetime import date
from pydantic import BaseModel, ConfigDict

from app.models.patient import Sex


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nik: str | None
    name: str
    dob: date
    sex: Sex
    phone: str | None
    bpjs_number: str | None
    age: int
