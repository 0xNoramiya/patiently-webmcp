import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.visit import Visit
    from app.models.queue_ticket import QueueTicket


class Sex(str, enum.Enum):
    M = "M"
    F = "F"


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nik: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    dob: Mapped[date] = mapped_column(Date, nullable=False)
    sex: Mapped[Sex] = mapped_column(Enum(Sex, name="sex_enum"), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    bpjs_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    visits: Mapped[list["Visit"]] = relationship(
        "Visit", back_populates="patient", cascade="all,delete-orphan"
    )
    tickets: Mapped[list["QueueTicket"]] = relationship(
        "QueueTicket", back_populates="patient", cascade="all,delete-orphan"
    )

    @property
    def age(self) -> int:
        today = date.today()
        return (
            today.year
            - self.dob.year
            - ((today.month, today.day) < (self.dob.month, self.dob.day))
        )
