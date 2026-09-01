"""SOAP-format consultation note drafted by the Notes Agent
after a consultation ends. One per ticket; latest wins."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.queue_ticket import QueueTicket


class NoteStatus(str, enum.Enum):
    pending = "pending"
    drafting = "drafting"
    done = "done"
    failed = "failed"


class ConsultationNote(Base):
    __tablename__ = "consultation_notes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("queue_tickets.id", ondelete="CASCADE"),
        index=True,
    )
    status: Mapped[NoteStatus] = mapped_column(
        Enum(NoteStatus, name="note_status_enum"),
        nullable=False,
        default=NoteStatus.pending,
    )
    subjective: Mapped[str | None] = mapped_column(Text, nullable=True)
    objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessment: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    ticket: Mapped["QueueTicket"] = relationship("QueueTicket")
