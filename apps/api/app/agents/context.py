"""Build the EMR context block fed to each agent."""
from __future__ import annotations

from datetime import date, timedelta
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.patient import Patient
from app.models.queue_ticket import QueueTicket
from app.models.visit import Visit


async def previous_visit_for(
    db: AsyncSession, ticket: QueueTicket, window_days: int = 30
) -> Visit | None:
    cutoff = date.today() - timedelta(days=window_days)
    stmt = (
        select(Visit)
        .where(
            and_(
                Visit.patient_id == ticket.patient_id,
                Visit.poli == ticket.poli,
                Visit.visit_date >= cutoff,
                Visit.visit_date < date.today(),
            )
        )
        .options(selectinload(Visit.prescriptions))
        .order_by(desc(Visit.visit_date))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def previous_visit_for_visit(db: AsyncSession, visit_id):
    """Look up a single visit by id, with prescriptions, for reminder context."""
    stmt = (
        select(Visit)
        .where(Visit.id == visit_id)
        .options(selectinload(Visit.prescriptions))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def all_recent_visits(
    db: AsyncSession, patient_id, window_days: int = 365
) -> list[Visit]:
    cutoff = date.today() - timedelta(days=window_days)
    stmt = (
        select(Visit)
        .where(and_(Visit.patient_id == patient_id, Visit.visit_date >= cutoff))
        .options(selectinload(Visit.prescriptions))
        .order_by(desc(Visit.visit_date))
        .limit(10)
    )
    return list((await db.execute(stmt)).scalars().all())


def render_patient_block(patient: Patient) -> str:
    sex = "Male" if patient.sex.value == "M" else "Female"
    return (
        f"Name: {patient.name}\n"
        f"Sex: {sex}\n"
        f"Age: {patient.age} years\n"
        f"DOB: {patient.dob.isoformat()}\n"
    )


def render_previous_visit_block(visit: Visit) -> str:
    if not visit:
        return "No related visits within the last 30 days."
    rx_lines = []
    for rx in visit.prescriptions:
        rx_lines.append(
            f"  - {rx.drug_name} {rx.dose} {rx.frequency} × {rx.duration_days} days"
            + (f" ({rx.instructions})" if rx.instructions else "")
        )
    rx_block = "\n".join(rx_lines) if rx_lines else "  (no prescriptions on file)"
    return (
        f"Visit date: {visit.visit_date.isoformat()}\n"
        f"Chief complaint: {visit.chief_complaint}\n"
        f"Diagnosis: {visit.diagnosis_icd10 or '-'}\n"
        f"Notes: {visit.notes or '-'}\n"
        f"Prescriptions:\n{rx_block}\n"
        f"Prescriber: {visit.prescriber_id or '-'}\n"
    )


def render_history_block(visits: list[Visit]) -> str:
    if not visits:
        return "No prior visits on file."
    lines = []
    for v in visits:
        lines.append(
            f"- {v.visit_date.isoformat()} [{v.poli.value}] {v.chief_complaint}"
            + (f" → {v.diagnosis_icd10}" if v.diagnosis_icd10 else "")
        )
    return "\n".join(lines)
