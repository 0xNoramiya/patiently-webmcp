"""Notes service — orchestrates SOAP note drafting per ticket."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.context import (
    previous_visit_for,
    render_patient_block,
    render_previous_visit_block,
)
from app.agents.notes import draft_note
from app.core.db import SessionLocal
from app.models.intake import IntakeSession
from app.models.note import ConsultationNote, NoteStatus
from app.models.queue_ticket import QueueTicket
from app.models.transcript import ConsultationTranscript, TranscriptStatus
from app.models.vital_signs import VitalSigns
from app.services.events import bus
from app.services.vitals import CRITICAL_LABELS

logger = logging.getLogger(__name__)


async def draft_for_ticket(ticket_id: uuid.UUID) -> dict:
    async with SessionLocal() as db:
        ticket = await _load_ticket(db, ticket_id)
        if ticket is None:
            raise ValueError("ticket not found")

        prev = await previous_visit_for(db, ticket)
        patient_block = render_patient_block(ticket.patient)
        prev_block = render_previous_visit_block(prev) if prev else None
        summary = (
            ticket.intake_session.summary
            if ticket.intake_session and ticket.intake_session.summary
            else None
        )
        transcript_text = await _latest_transcript_text(db, ticket_id)
        vitals_block = await _vitals_block(db, ticket_id)
        if vitals_block:
            patient_block = (
                patient_block + "\nVitals on arrival:\n" + vitals_block
            )

        record = ConsultationNote(
            ticket_id=ticket_id, status=NoteStatus.drafting
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)

        try:
            drafted = await draft_note(
                patient_block=patient_block,
                intake_summary=summary,
                transcript_text=transcript_text,
                previous_visit_block=prev_block,
            )
            record.subjective = drafted.get("subjective")
            record.objective = drafted.get("objective")
            record.assessment = drafted.get("assessment")
            record.plan = drafted.get("plan")
            record.raw_response = {"text": drafted.get("raw_response", "")}
            record.model_used = drafted.get("model_used")
            record.status = NoteStatus.done
            record.completed_at = datetime.now(timezone.utc)
        except Exception as e:  # noqa: BLE001
            logger.exception("notes draft failed: %s", e)
            record.status = NoteStatus.failed
            record.error = str(e)[:500]

        await db.commit()
        await db.refresh(record)

        await bus.publish_many(
            ["dashboard", f"ticket:{ticket_id}"],
            "note_ready",
            {"ticket_id": str(ticket_id), "status": record.status.value},
        )

        return _serialize(record)


async def get_for_ticket(ticket_id: uuid.UUID) -> dict | None:
    async with SessionLocal() as db:
        stmt = (
            select(ConsultationNote)
            .where(ConsultationNote.ticket_id == ticket_id)
            .order_by(ConsultationNote.created_at.desc())
            .limit(1)
        )
        row = (await db.execute(stmt)).scalar_one_or_none()
        return _serialize(row) if row else None


async def _vitals_block(
    db: AsyncSession, ticket_id: uuid.UUID
) -> str | None:
    stmt = select(VitalSigns).where(VitalSigns.ticket_id == ticket_id)
    v = (await db.execute(stmt)).scalar_one_or_none()
    if v is None:
        return None
    rows: list[str] = []
    if v.systolic_bp and v.diastolic_bp:
        rows.append(f"  BP {v.systolic_bp}/{v.diastolic_bp} mmHg")
    if v.heart_rate:
        rows.append(f"  HR {v.heart_rate} bpm")
    if v.respiratory_rate:
        rows.append(f"  RR {v.respiratory_rate} /min")
    if v.temperature_c is not None:
        rows.append(f"  Temp {v.temperature_c:.1f} °C")
    if v.spo2:
        rows.append(f"  SpO₂ {v.spo2}%")
    if v.pain_score is not None:
        rows.append(f"  Pain {v.pain_score}/10")
    if v.critical_findings:
        rows.append(
            "  Critical findings: "
            + ", ".join(
                CRITICAL_LABELS.get(f, f) for f in v.critical_findings
            )
        )
    return "\n".join(rows) if rows else None


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


async def _latest_transcript_text(
    db: AsyncSession, ticket_id: uuid.UUID
) -> str | None:
    stmt = (
        select(ConsultationTranscript)
        .where(ConsultationTranscript.ticket_id == ticket_id)
        .where(ConsultationTranscript.status == TranscriptStatus.done)
        .order_by(ConsultationTranscript.created_at.desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    return row.transcript_text if row else None


def _serialize(r: ConsultationNote) -> dict:
    return {
        "id": str(r.id),
        "ticket_id": str(r.ticket_id),
        "status": r.status.value,
        "subjective": r.subjective,
        "objective": r.objective,
        "assessment": r.assessment,
        "plan": r.plan,
        "model_used": r.model_used,
        "error": r.error,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
    }
