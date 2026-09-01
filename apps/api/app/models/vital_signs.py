"""Vital signs captured by the triage nurse before the consultation.

One row per ticket — re-recording overwrites the latest. We store both the
measurements and a list of auto-detected critical findings (e.g. hypertensive
crisis) so the dashboard can render warnings without re-computing.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.queue_ticket import QueueTicket


class VitalSigns(Base):
    __tablename__ = "vital_signs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("queue_tickets.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    systolic_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diastolic_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    respiratory_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    spo2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    pain_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recorded_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    critical_findings: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    ticket: Mapped["QueueTicket"] = relationship("QueueTicket")
