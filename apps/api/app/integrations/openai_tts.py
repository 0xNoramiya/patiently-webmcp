"""Text-to-speech for the mock consultation audio.

The dashboard's transcript demo needs a doctor-patient conversation to feed
Speechmatics, and there is no real microphone in a demo. This synthesizes one.

Previously this used EdgeTTS, which drives Microsoft's unofficial Bing endpoint;
that endpoint now requires a signed token and returns 403, so the feature was
dead. Since the clinical agents already run on OpenAI, the audio does too — one
fewer credential, and no dependency on an interface nobody publishes.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Two distinct voices so Speechmatics has something to diarize.
DOCTOR_VOICE = "onyx"
PATIENT_VOICE = "nova"


class TTSError(Exception):
    pass


async def synthesize_line(text: str, voice: str) -> bytes:
    """Render one utterance to MP3 bytes."""
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise TTSError("OPENAI_API_KEY not configured")

    payload: dict[str, Any] = {
        "model": settings.OPENAI_TTS_MODEL,
        "voice": voice,
        "input": text,
        "response_format": "mp3",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{settings.OPENAI_BASE_URL.rstrip('/')}/audio/speech",
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
        )
        if resp.status_code != 200:
            logger.error("OpenAI TTS %s: %s", resp.status_code, resp.text[:300])
            raise TTSError(f"TTS returned {resp.status_code}: {resp.text[:200]}")
        return resp.content


async def synthesize_dialogue(turns: list[tuple[str, str]]) -> bytes:
    """`turns` is [(speaker, text), ...] where speaker is 'doctor' or 'patient'.

    Each line is rendered separately so the two speakers get different voices,
    then the MP3 frames are concatenated — which players and Speechmatics both
    accept for constant-bitrate MP3.
    """
    pieces: list[bytes] = []
    for speaker, text in turns:
        voice = DOCTOR_VOICE if speaker == "doctor" else PATIENT_VOICE
        pieces.append(await synthesize_line(text, voice))
    return b"".join(pieces)
