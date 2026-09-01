"""Patient-side voice intake.

The patient records on their phone (MediaRecorder in the browser, typically
audio/webm;codecs=opus) and POSTs the blob here. We forward to Speechmatics
batch ASR and return the transcript text, which the chat UI drops into the
message input for the patient to review and send.

Public route — no admin gate — because the patient making the recording is
the same user already authorised to chat in their own intake session. We
DO require the ticket exists.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.integrations import speechmatics
from app.models.queue_ticket import QueueTicket

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_AUDIO_BYTES = 6 * 1024 * 1024  # 6 MB — ~3 min of opus voice
ALLOWED_TYPES = {
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/ogg",
    "audio/mpeg",
    "audio/mp4",
    "audio/m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
}


class TranscribeOut(BaseModel):
    transcript: str
    job_id: str


@router.post(
    "/intake/{ticket_id}/voice",
    response_model=TranscribeOut,
)
async def transcribe_voice(
    ticket_id: uuid.UUID,
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> TranscribeOut:
    ticket = await db.get(QueueTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")

    content_type = (audio.content_type or "").lower().split(";")[0].strip()
    if content_type and content_type not in {t.split(";")[0] for t in ALLOWED_TYPES}:
        # We don't hard-block here — Speechmatics accepts many formats — but
        # we do log so a misconfigured client is debuggable.
        logger.info(
            "voice upload with unexpected content_type=%s for ticket %s",
            content_type,
            ticket_id,
        )

    data = await audio.read()
    if len(data) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"audio too large ({len(data)} bytes); max {MAX_AUDIO_BYTES}",
        )

    try:
        result = await speechmatics.transcribe_bytes(
            data,
            language="en",
            diarize=False,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("speechmatics voice transcribe failed: %s", e)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"transcription failed: {e}"
        )

    return TranscribeOut(
        transcript=result.get("transcript", ""),
        job_id=result.get("job_id", ""),
    )
