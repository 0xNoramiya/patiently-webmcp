import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.prescription import Prescription


class Poli(str, enum.Enum):
    umum = "umum"
    anak = "anak"
    kia = "kia"
    gigi = "gigi"
    lansia = "lansia"


POLI_LABEL = {
    Poli.umum: "Poli Umum",
    Poli.anak: "Poli Anak",
    Poli.kia: "Poli KIA",
    Poli.gigi: "Poli Gigi",
    Poli.lansia: "Poli Lansia",
}

POLI_PREFIX = {
    Poli.umum: "A",
    Poli.anak: "B",
    Poli.kia: "C",
    Poli.gigi: "D",
    Poli.lansia: "E",
}


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    visit_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    poli: Mapped[Poli] = mapped_column(Enum(Poli, name="poli_enum"), nullable=False)
    chief_complaint: Mapped[str] = mapped_column(Text, nullable=False)
    diagnosis_icd10: Mapped[str | None] = mapped_column(String(16), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    prescriber_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    patient: Mapped["Patient"] = relationship("Patient", back_populates="visits")
    prescriptions: Mapped[list["Prescription"]] = relationship(
        "Prescription", back_populates="visit", cascade="all,delete-orphan"
    )
