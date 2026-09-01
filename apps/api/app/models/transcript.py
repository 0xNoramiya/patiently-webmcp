import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.queue_ticket import QueueTicket


class TranscriptStatus(str, enum.Enum):
    pending = "pending"
    transcribing = "transcribing"
    done = "done"
    failed = "failed"


class ConsultationTranscript(Base):
    __tablename__ = "consultation_transcripts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("queue_tickets.id", ondelete="CASCADE"),
        index=True,
    )
    audio_path: Mapped[str] = mapped_column(String(255), nullable=False)
    speechmatics_job_id: Mapped[str | None] = mapped_column(
        String(120), nullable=True
    )
    status: Mapped[TranscriptStatus] = mapped_column(
        Enum(TranscriptStatus, name="transcript_status_enum"),
        nullable=False,
        default=TranscriptStatus.pending,
    )
    transcript_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    ticket: Mapped["QueueTicket"] = relationship("QueueTicket")
