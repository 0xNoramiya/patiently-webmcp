"""Gather every drug currently associated with a ticket and run the
interaction matcher across the merged pool.

Sources:
  1. PrescriptionDraft rows (the drugs the Rx agent just
     suggested).
  2. The intake session's `structured_data.medications_taken_today`
     (what the patient told the agent they were taking today).
  3. The previous-visit prescriptions (chronic meds carrying through).
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.context import previous_visit_for
from app.core.db import SessionLocal
from app.models.intake import IntakeSession
from app.models.prescription_draft import PrescriptionDraft
from app.models.queue_ticket import QueueTicket
from app.services.drug_interactions import (
    Interaction,
    find_interactions,
    serialize,
)


async def collect_drug_names(
    db: AsyncSession, ticket_id: uuid.UUID
) -> dict[str, list[str]]:
    """Return drug names per source for a given ticket. Empty lists are fine."""
    stmt = (
        select(QueueTicket)
        .where(QueueTicket.id == ticket_id)
        .options(
            selectinload(QueueTicket.patient),
            selectinload(QueueTicket.intake_session),
        )
    )
    ticket = (await db.execute(stmt)).scalar_one_or_none()
    if ticket is None:
        raise ValueError("ticket not found")

    drafts_stmt = (
        select(PrescriptionDraft)
        .where(PrescriptionDraft.ticket_id == ticket_id)
        .order_by(PrescriptionDraft.created_at)
    )
    drafts = (await db.execute(drafts_stmt)).scalars().all()
    draft_names = [d.drug_name for d in drafts]

    home_names: list[str] = []
    if ticket.intake_session and ticket.intake_session.structured_data:
        raw = (
            ticket.intake_session.structured_data.get("medications_taken_today")
            or []
        )
        if isinstance(raw, list):
            home_names = [str(x).strip() for x in raw if str(x).strip()]

    prev_names: list[str] = []
    prev = await previous_visit_for(db, ticket)
    if prev and prev.prescriptions:
        prev_names = [rx.drug_name for rx in prev.prescriptions]

    return {
        "drafts": draft_names,
        "home_meds": home_names,
        "previous_rx": prev_names,
    }


async def check_for_ticket(ticket_id: uuid.UUID) -> dict[str, Any]:
    async with SessionLocal() as db:
        sources = await collect_drug_names(db, ticket_id)

    all_drugs = sources["drafts"] + sources["home_meds"] + sources["previous_rx"]
    interactions = find_interactions(all_drugs)
    by_severity = {"major": 0, "moderate": 0, "minor": 0}
    for inter in interactions:
        by_severity[inter.severity] = by_severity.get(inter.severity, 0) + 1
    return {
        "ticket_id": str(ticket_id),
        "drug_count": len(set(all_drugs)),
        "sources": sources,
        "interactions": serialize(interactions),
        "by_severity": by_severity,
    }
