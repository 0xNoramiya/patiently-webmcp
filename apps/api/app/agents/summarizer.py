"""Summarizer Agent — produces the physician-facing chart.

Runs once when an intake session completes. Consumes the full transcript,
the structured fields extracted by the Intake Agent, the flags raised by
the Triage Agent, and the EMR context.
"""
from __future__ import annotations

import logging

import os
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.context import (
    all_recent_visits,
    previous_visit_for,
    render_history_block,
    render_patient_block,
    render_previous_visit_block,
)
from app.core.config import get_settings
from app.integrations.openai_client import DEGRADED_KEY, generate_json
from app.agents.schemas import SUMMARY_SCHEMA
from app.models.intake import IntakeMessage, IntakeSession, MessageRole
from app.models.queue_ticket import QueueTicket
from app.services.events import bus

logger = logging.getLogger(__name__)

_PROMPT_PATH = os.path.join(
    os.path.dirname(__file__), "prompts", "summarizer_system.txt"
)
with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
    SUMMARIZER_SYSTEM_PROMPT = f.read()


def _render_transcript(messages: list[IntakeMessage]) -> str:
    lines = []
    for m in messages:
        if m.role == MessageRole.system:
            continue
        speaker = "Agent" if m.role == MessageRole.agent else "Patient"
        lines.append(f"{speaker}: {m.content}")
    return "\n".join(lines)


async def summarize_session(
    db: AsyncSession, session_id: uuid.UUID
) -> dict[str, Any]:
    stmt = (
        select(IntakeSession)
        .where(IntakeSession.id == session_id)
        .options(
            selectinload(IntakeSession.messages),
            selectinload(IntakeSession.ticket).selectinload(QueueTicket.patient),
        )
    )
    session = (await db.execute(stmt)).scalar_one_or_none()
    if session is None:
        raise ValueError("session not found")

    ticket = session.ticket
    patient = ticket.patient

    prev = await previous_visit_for(db, ticket) if ticket.is_followup else None
    history = await all_recent_visits(db, patient.id)

    patient_block = render_patient_block(patient)
    prev_block = (
        render_previous_visit_block(prev)
        if prev
        else "No prior visit on file."
    )
    history_block = render_history_block(history)
    transcript = _render_transcript(session.messages)

    user_text = (
        "=== PATIENT ===\n"
        f"{patient_block}\n"
        f"Clinic department: {ticket.poli.value}\n"
        f"is_followup: {str(ticket.is_followup).lower()}\n"
        "\n=== PREVIOUS VISIT (if any) ===\n"
        f"{prev_block}\n"
        "\n=== EMR HISTORY (last 12 months) ===\n"
        f"{history_block}\n"
        "\n=== RED FLAGS RAISED BY TRIAGE AGENT ===\n"
        f"{', '.join(session.triage_flags) if session.triage_flags else '(none)'}\n"
        "\n=== STRUCTURED FIELDS EXTRACTED BY INTAKE AGENT ===\n"
        f"{session.structured_data}\n"
        "\n=== TRANSCRIPT ===\n"
        f"{transcript}\n"
        "\nGenerate the summary now as JSON matching the schema."
    )

    contents = [{"role": "user", "parts": [{"text": user_text}]}]
    summary = await generate_json(
        system_instruction=SUMMARIZER_SYSTEM_PROMPT,
        contents=contents,
        response_schema=SUMMARY_SCHEMA,
        model=get_settings().OPENAI_MODEL_CLINICAL,
        temperature=0.3,
    )

    # A stub is not a chart. Persisting one would give the patient a permanent
    # record reading "Summary service unavailable" under a heading that says
    # TRIAGE ASSESSMENT, announce summary_ready as though it had worked, and
    # satisfy every downstream `if (summary)` check — including the guard that
    # stops a SOAP note being drafted from an empty chart. Record the failure
    # instead and leave the chart genuinely absent, so it reads as missing
    # rather than as written-and-empty.
    if summary.get(DEGRADED_KEY):
        logger.error(
            "Summarizer unavailable for ticket %s — no pre-visit chart was written.",
            ticket.id,
        )
        session.structured_data = {
            **(session.structured_data or {}),
            "_summary_failed": True,
        }
        await db.commit()
        await bus.publish_many(
            [f"poli:{ticket.poli.value}", "dashboard", f"ticket:{ticket.id}"],
            "summary_failed",
            {"ticket_id": str(ticket.id), "poli": ticket.poli.value},
        )
        return summary

    session.summary = summary
    session.structured_data = {
        k: v
        for k, v in (session.structured_data or {}).items()
        if k != "_summary_failed"
    }
    await db.commit()

    await bus.publish_many(
        [f"poli:{ticket.poli.value}", "dashboard", f"ticket:{ticket.id}"],
        "summary_ready",
        {"ticket_id": str(ticket.id), "poli": ticket.poli.value},
    )

    return summary
