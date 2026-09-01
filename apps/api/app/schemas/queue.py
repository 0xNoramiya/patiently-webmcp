import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.models.queue_ticket import TicketStatus, Payer
from app.models.visit import Poli
from app.schemas.patient import PatientOut
from app.schemas.visit import VisitOut


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ticket_number: str
    poli: Poli
    payer: Payer
    status: TicketStatus
    priority: int
    is_followup: bool
    issued_at: datetime
    called_at: datetime | None
    completed_at: datetime | None


class TicketDetail(TicketOut):
    patient: PatientOut
    previous_visit: VisitOut | None = None
    triage_flags: list[str] = []
    intake_complete: bool = False


class IssueTicketRequest(BaseModel):
    patient_id: uuid.UUID
    poli: Poli
    payer: Payer = Payer.bpjs


class QueueEntry(BaseModel):
    ticket: TicketOut
    patient: PatientOut
    position: int
    eta_minutes_low: int
    eta_minutes_high: int
    triage_flags: list[str] = []


class QueueState(BaseModel):
    poli: Poli
    now_serving: TicketOut | None
    avg_consultation_minutes: float
    waiting: list[QueueEntry]
    in_intake: list[QueueEntry]
    intake_complete: list[QueueEntry]
    in_consultation: list[QueueEntry]
