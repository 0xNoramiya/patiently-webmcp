import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.models.reminder import ReminderStatus
from app.schemas.patient import PatientOut


class ReminderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient: PatientOut
    scheduled_for: datetime
    appointment_at: datetime
    reason: str
    channel: str
    status: ReminderStatus
    message: str | None
    model_used: str | None
    error: str | None
    generated_at: datetime | None
    sent_at: datetime | None
    created_at: datetime


class TranscriptOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    audio_path: str
    status: str
    transcript_text: str | None
    error: str | None
    speechmatics_job_id: str | None
    created_at: str | None
    completed_at: str | None
