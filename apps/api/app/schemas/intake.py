import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

from app.models.intake import IntakeStatus, MessageRole


class IntakeMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    role: MessageRole
    content: str
    created_at: datetime


class IntakeSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ticket_id: uuid.UUID
    status: IntakeStatus
    structured_data: dict[str, Any] = {}
    triage_flags: list[str] = []
    summary: dict[str, Any] | None = None
    language: str = "en"
    started_at: datetime
    completed_at: datetime | None
    messages: list[IntakeMessageOut] = []


class PatientMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class AgentResponse(BaseModel):
    """Schema Gemini must return on every turn."""

    reply_text: str
    extracted_fields: dict[str, Any] = {}
    triage_flags: list[str] = []
    is_complete: bool = False


class IntakeSummary(BaseModel):
    chief_complaint: str
    hpi_paragraph: str
    relevant_history: list[str] = []
    triage_assessment: str
    followup_delta: dict[str, Any] | None = None
    suggested_questions: list[str] = []
    differentials: list[str] = []
