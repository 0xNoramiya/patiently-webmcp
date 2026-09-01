"""Consultation transcription pipeline.

Flow:
  1. Build a mock doctor-patient dialogue from a scenario tag (cardiac /
     follow-up / general). Use EdgeTTS to synthesize MP3 bytes.
  2. Cache the MP3 on disk under STATIC_DIR/audio/{ticket_id}.mp3 so the
     browser can play it back via /api/static/audio/...
  3. Send the MP3 to Speechmatics batch ASR, poll until done, fetch txt.
  4. Persist as ConsultationTranscript.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiofiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import SessionLocal
from app.integrations import edge_tts as tts
from app.integrations import speechmatics
from app.models.queue_ticket import QueueTicket
from app.models.transcript import ConsultationTranscript, TranscriptStatus
from app.services.events import bus

logger = logging.getLogger(__name__)

STATIC_DIR = Path(
    os.environ.get(
        "PATIENTLY_STATIC_DIR",
        str(Path(__file__).resolve().parent.parent.parent / "static"),
    )
)
AUDIO_DIR = STATIC_DIR / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


SCENARIOS: dict[str, list[tuple[str, str]]] = {
    "cardiac": [
        ("doctor", "Hello {name}, I'm Dr. Patel. I see you came in with chest pain. Tell me what happened today."),
        ("patient", "It started about an hour ago. Heavy pressure right in the middle of my chest."),
        ("doctor", "Does it spread anywhere, like to your arm, jaw, or back?"),
        ("patient", "Yes, it goes down my left arm. And I started sweating, kind of cold."),
        ("doctor", "Any shortness of breath, or feeling lightheaded?"),
        ("patient", "A little short of breath. Not dizzy, but it feels heavy."),
        ("doctor", "Have you had anything like this before? Any history of heart problems, high blood pressure, or diabetes?"),
        ("patient", "Blood pressure has been borderline. Never had anything like this before."),
        ("doctor", "Okay. We're going to get an ECG and some labs right now. The intake team already flagged this — you were moved to the front. Try to stay calm, we'll be quick."),
    ],
    "followup": [
        ("doctor", "Hi {name}, good to see you back. The last visit was for a cough, right? How are you feeling now?"),
        ("patient", "Much better, doctor. The cough is mostly gone. Just a little tickle in my throat now and then."),
        ("doctor", "And you finished the full ambroxol course?"),
        ("patient", "Yes, three times a day. Took the whole bottle."),
        ("doctor", "Any side effects? Stomach upset, drowsiness?"),
        ("patient", "None at all. Fever cleared up after two days."),
        ("doctor", "Excellent. The itch is likely post-infectious irritation — should settle on its own. Lozenges and warm fluids help. We don't need another round of medication."),
        ("patient", "Thank you, doctor."),
    ],
    "general": [
        ("doctor", "Hello {name}. I read the pre-visit summary. Tell me a bit more about how the symptoms have been."),
        ("patient", "It's been bothering me for a few days. I'm just hoping to get something for it."),
        ("doctor", "Got it. Let me examine you and we'll figure out the right plan together."),
    ],
}


def _pick_scenario(ticket: QueueTicket) -> str:
    if ticket.intake_session and ticket.intake_session.triage_flags:
        if "CHEST_PAIN_CARDIAC" in ticket.intake_session.triage_flags:
            return "cardiac"
    if ticket.is_followup:
        return "followup"
    return "general"


def _build_dialogue(scenario: str, patient_name: str) -> list[tuple[str, str]]:
    first = patient_name.split()[0] if patient_name else "there"
    return [
        (speaker, text.format(name=first))
        for speaker, text in SCENARIOS[scenario]
    ]


async def generate_and_transcribe(ticket_id: uuid.UUID) -> dict:
    """Public entry point. Synthesizes audio + transcribes via Speechmatics.

    Idempotent: if a 'done' transcript exists for this ticket, return it
    without re-running.
    """
    async with SessionLocal() as db:
        ticket = await _load_ticket(db, ticket_id)
        if ticket is None:
            raise ValueError("ticket not found")

        existing = await _existing_done_transcript(db, ticket_id)
        if existing:
            return _serialize(existing)

        scenario = _pick_scenario(ticket)
        dialogue = _build_dialogue(scenario, ticket.patient.name)

        # Step 1: synth audio
        audio_bytes = await tts.synthesize_dialogue(dialogue)
        filename = f"{ticket_id}.mp3"
        path = AUDIO_DIR / filename
        async with aiofiles.open(path, "wb") as f:
            await f.write(audio_bytes)

        # Step 2: persist row as transcribing
        record = ConsultationTranscript(
            ticket_id=ticket_id,
            audio_path=f"/api/static/audio/{filename}",
            status=TranscriptStatus.transcribing,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)

        await bus.publish(
            "dashboard",
            "transcript_started",
            {"ticket_id": str(ticket_id), "scenario": scenario},
        )

        # Step 3: Speechmatics
        try:
            res = await speechmatics.transcribe_bytes(audio_bytes, language="en")
            record.speechmatics_job_id = res["job_id"]
            record.transcript_text = res["transcript"]
            record.status = TranscriptStatus.done
            record.completed_at = datetime.now(timezone.utc)
            record.error = None
        except Exception as e:  # noqa: BLE001
            logger.exception("speechmatics failed: %s", e)
            record.status = TranscriptStatus.failed
            record.error = str(e)[:500]

        await db.commit()
        await db.refresh(record)

        await bus.publish(
            "dashboard",
            "transcript_ready",
            {
                "ticket_id": str(ticket_id),
                "transcript_id": str(record.id),
                "status": record.status.value,
            },
        )

        return _serialize(record)


async def get_transcript_for_ticket(ticket_id: uuid.UUID) -> dict | None:
    async with SessionLocal() as db:
        stmt = (
            select(ConsultationTranscript)
            .where(ConsultationTranscript.ticket_id == ticket_id)
            .order_by(ConsultationTranscript.created_at.desc())
            .limit(1)
        )
        row = (await db.execute(stmt)).scalar_one_or_none()
        if row is None:
            return None
        return _serialize(row)


async def _load_ticket(db: AsyncSession, ticket_id: uuid.UUID):
    stmt = (
        select(QueueTicket)
        .where(QueueTicket.id == ticket_id)
        .options(
            selectinload(QueueTicket.patient),
            selectinload(QueueTicket.intake_session),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _existing_done_transcript(
    db: AsyncSession, ticket_id: uuid.UUID
) -> ConsultationTranscript | None:
    stmt = (
        select(ConsultationTranscript)
        .where(ConsultationTranscript.ticket_id == ticket_id)
        .where(ConsultationTranscript.status == TranscriptStatus.done)
        .order_by(ConsultationTranscript.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _serialize(record: ConsultationTranscript) -> dict:
    return {
        "id": str(record.id),
        "ticket_id": str(record.ticket_id),
        "audio_path": record.audio_path,
        "status": record.status.value,
        "transcript_text": record.transcript_text,
        "error": record.error,
        "speechmatics_job_id": record.speechmatics_job_id,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "completed_at": record.completed_at.isoformat()
        if record.completed_at
        else None,
    }
