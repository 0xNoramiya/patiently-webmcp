"""Speechmatics batch ASR client.

Base URL eu1.asr.api.speechmatics.com (free / starter tier). Auth via
Authorization: Bearer header. Standard batch flow:
  POST /v2/jobs/    (multipart: data_file + config JSON)
  GET  /v2/jobs/{id}                       → poll until status='done'
  GET  /v2/jobs/{id}/transcript?format=txt → final transcript text
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

BASE_URL = "https://eu1.asr.api.speechmatics.com/v2"


class SpeechmaticsError(Exception):
    pass


def _headers() -> dict[str, str]:
    key = get_settings().SPEECHMATICS_API_KEY
    if not key:
        raise SpeechmaticsError("SPEECHMATICS_API_KEY not configured")
    return {"Authorization": f"Bearer {key}"}


async def submit_job(
    audio_bytes: bytes,
    *,
    filename: str = "audio.mp3",
    language: str = "en",
    operating_point: str = "enhanced",
    diarize: bool = True,
) -> str:
    """Submit a batch transcription job. Returns the job ID."""
    config = {
        "type": "transcription",
        "transcription_config": {
            "language": language,
            "operating_point": operating_point,
            **({"diarization": "speaker"} if diarize else {}),
        },
    }
    files = {
        "data_file": (filename, audio_bytes, "audio/mpeg"),
        "config": (None, json.dumps(config), "application/json"),
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{BASE_URL}/jobs/", files=files, headers=_headers()
        )
        if resp.status_code not in (200, 201):
            raise SpeechmaticsError(
                f"submit failed {resp.status_code}: {resp.text[:300]}"
            )
        data = resp.json()
        job_id = data.get("id")
        if not job_id:
            raise SpeechmaticsError(f"no job id in response: {data}")
        return job_id


async def wait_for_job(
    job_id: str,
    *,
    poll_interval: float = 2.0,
    timeout: float = 90.0,
) -> dict[str, Any]:
    """Poll until Speechmatics returns status='done' (or fails)."""
    elapsed = 0.0
    async with httpx.AsyncClient(timeout=30.0) as client:
        while elapsed < timeout:
            resp = await client.get(
                f"{BASE_URL}/jobs/{job_id}", headers=_headers()
            )
            if resp.status_code != 200:
                raise SpeechmaticsError(
                    f"status check {resp.status_code}: {resp.text[:200]}"
                )
            data = resp.json().get("job", resp.json())
            status = (data or {}).get("status")
            if status == "done":
                return data
            if status in ("rejected", "deleted", "failed", "expired"):
                raise SpeechmaticsError(f"job ended in status={status}: {data}")
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
    raise SpeechmaticsError(f"job {job_id} timed out after {timeout}s")


async def get_transcript_text(job_id: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{BASE_URL}/jobs/{job_id}/transcript",
            params={"format": "txt"},
            headers=_headers(),
        )
        if resp.status_code != 200:
            raise SpeechmaticsError(
                f"transcript fetch {resp.status_code}: {resp.text[:300]}"
            )
        return resp.text.strip()


async def transcribe_bytes(
    audio_bytes: bytes,
    *,
    language: str = "en",
    diarize: bool = True,
) -> dict[str, Any]:
    """Convenience: submit + poll + fetch. Returns {job_id, transcript}."""
    job_id = await submit_job(audio_bytes, language=language, diarize=diarize)
    logger.info("Speechmatics job submitted: %s", job_id)
    await wait_for_job(job_id)
    transcript = await get_transcript_text(job_id)
    return {"job_id": job_id, "transcript": transcript}
