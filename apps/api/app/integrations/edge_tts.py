"""EdgeTTS helper — generate MP3 bytes from a script.

Used to mock doctor-patient appointment audio for the dashboard's
"Transcribe appointment" demo. Returns MP3 bytes that we feed straight
into Speechmatics for transcription, and also serve to the browser for
playback.
"""
from __future__ import annotations

import asyncio
import logging

import edge_tts

logger = logging.getLogger(__name__)

# Two voices = mock dialogue. We synthesize each line separately and
# concatenate the MP3 chunks (this works for MP3 frames in practice).
DOCTOR_VOICE = "en-US-GuyNeural"
PATIENT_VOICE = "en-US-AriaNeural"


async def synthesize_line(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text=text, voice=voice, rate="+0%")
    chunks: list[bytes] = []
    async for msg in communicate.stream():
        if msg.get("type") == "audio":
            chunks.append(msg["data"])
    return b"".join(chunks)


async def synthesize_dialogue(
    turns: list[tuple[str, str]],
) -> bytes:
    """`turns` is [(speaker, text), ...] where speaker is 'doctor' or 'patient'."""
    pieces: list[bytes] = []
    for speaker, text in turns:
        voice = DOCTOR_VOICE if speaker == "doctor" else PATIENT_VOICE
        pieces.append(await synthesize_line(text, voice))
    return b"".join(pieces)
