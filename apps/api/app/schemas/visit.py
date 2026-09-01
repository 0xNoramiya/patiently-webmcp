import uuid
from datetime import date
from pydantic import BaseModel, ConfigDict

from app.models.visit import Poli


class PrescriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    drug_name: str
    dose: str
    frequency: str
    duration_days: int
    instructions: str | None


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    visit_date: date
    poli: Poli
    chief_complaint: str
    diagnosis_icd10: str | None
    notes: str | None
    prescriber_id: str | None
    prescriptions: list[PrescriptionOut] = []
