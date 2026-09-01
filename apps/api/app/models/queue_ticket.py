import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.visit import Poli

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.intake import IntakeSession


class TicketStatus(str, enum.Enum):
    waiting = "waiting"
    in_intake = "in_intake"
    intake_complete = "intake_complete"
    in_consultation = "in_consultation"
    done = "done"
    cancelled = "cancelled"


class Payer(str, enum.Enum):
    bpjs = "bpjs"
    umum = "umum"


class QueueTicket(Base):
    __tablename__ = "queue_tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_number: Mapped[str] = mapped_column(
        String(16), nullable=False, index=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    poli: Mapped[Poli] = mapped_column(
        Enum(Poli, name="poli_enum"), nullable=False, index=True
    )
    payer: Mapped[Payer] = mapped_column(
        Enum(Payer, name="payer_enum"), nullable=False
    )
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticket_status_enum"),
        nullable=False,
        default=TicketStatus.waiting,
        index=True,
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_followup: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    called_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    patient: Mapped["Patient"] = relationship("Patient", back_populates="tickets")
    intake_session: Mapped["IntakeSession | None"] = relationship(
        "IntakeSession",
        back_populates="ticket",
        uselist=False,
        cascade="all,delete-orphan",
    )
