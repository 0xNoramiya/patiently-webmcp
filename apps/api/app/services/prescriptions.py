"""Prescription drafts service — orchestrates Rx drafting,
persistence (one-write-replaces-existing), and approval."""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.context import previous_visit_for, render_patient_block
from app.agents.prescriptions import draft_prescriptions
from app.core.db import SessionLocal
from app.models.intake import IntakeSession
from app.models.note import ConsultationNote, NoteStatus
from app.models.prescription_draft import PrescriptionDraft
from app.models.queue_ticket import QueueTicket
from app.models.visit import Visit
from app.services.events import bus

logger = logging.getLogger(__name__)


async def draft_for_ticket(ticket_id: uuid.UUID) -> list[dict]:
    async with SessionLocal() as db:
        ticket = await _load_ticket(db, ticket_id)
        if ticket is None:
            raise ValueError("ticket not found")

        prev = await previous_visit_for(db, ticket)
        patient_block = render_patient_block(ticket.patient)
        summary = (
            ticket.intake_session.summary
            if ticket.intake_session and ticket.intake_session.summary
            else None
        )
        soap_plan = await _latest_soap_plan(db, ticket_id)
        prev_rx = _render_previous_rx(prev)

        items = await draft_prescriptions(
            patient_block=patient_block,
            summary=summary,
            soap_plan=soap_plan,
            previous_rx_block=prev_rx,
        )

        # Replace existing drafts for this ticket
        await db.execute(
            delete(PrescriptionDraft).where(
                PrescriptionDraft.ticket_id == ticket_id
            )
        )

        rows: list[PrescriptionDraft] = []
        for item in items:
            row = PrescriptionDraft(
                ticket_id=ticket_id,
                drug_name=item["drug_name"],
                dose=item["dose"],
                frequency=item["frequency"],
                duration_days=item["duration_days"],
                instructions=item.get("instructions"),
                rationale=item.get("rationale"),
                source="openai",
                approved=False,
            )
            rows.append(row)
            db.add(row)

        await db.commit()

        await bus.publish_many(
            ["dashboard", f"ticket:{ticket_id}"],
            "prescriptions_ready",
            {"ticket_id": str(ticket_id), "count": len(rows)},
        )

        for r in rows:
            await db.refresh(r)
        return [_serialize(r) for r in rows]


async def list_for_ticket(ticket_id: uuid.UUID) -> list[dict]:
    async with SessionLocal() as db:
        stmt = (
            select(PrescriptionDraft)
            .where(PrescriptionDraft.ticket_id == ticket_id)
            .order_by(PrescriptionDraft.created_at)
        )
        rows = (await db.execute(stmt)).scalars().all()
        return [_serialize(r) for r in rows]


async def set_approved(prescription_id: uuid.UUID, approved: bool) -> dict | None:
    async with SessionLocal() as db:
        row = await db.get(PrescriptionDraft, prescription_id)
        if row is None:
            return None
        row.approved = approved
        await db.commit()
        await db.refresh(row)
        return _serialize(row)


async def _load_ticket(db: AsyncSession, ticket_id: uuid.UUID):
    stmt = (
        select(QueueTicket)
        .where(QueueTicket.id == ticket_id)
        .options(
            selectinload(QueueTicket.patient),
            selectinload(QueueTicket.intake_session).selectinload(
                IntakeSession.messages
            ),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _latest_soap_plan(
    db: AsyncSession, ticket_id: uuid.UUID
) -> str | None:
    stmt = (
        select(ConsultationNote)
        .where(ConsultationNote.ticket_id == ticket_id)
        .where(ConsultationNote.status == NoteStatus.done)
        .order_by(ConsultationNote.created_at.desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    return row.plan if row else None


def _render_previous_rx(prev: Visit | None) -> str | None:
    if prev is None or not prev.prescriptions:
        return None
    lines = []
    for rx in prev.prescriptions:
        lines.append(
            f"- {rx.drug_name} {rx.dose} {rx.frequency} × {rx.duration_days} days"
        )
    return "\n".join(lines)


def _serialize(r: PrescriptionDraft) -> dict:
    return {
        "id": str(r.id),
        "ticket_id": str(r.ticket_id),
        "drug_name": r.drug_name,
        "dose": r.dose,
        "frequency": r.frequency,
        "duration_days": r.duration_days,
        "instructions": r.instructions,
        "rationale": r.rationale,
        "source": r.source,
        "approved": r.approved,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
