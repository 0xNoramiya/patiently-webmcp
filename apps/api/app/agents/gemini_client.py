"""Thin Gemini client wrapper.

Uses google-generativeai with response_mime_type='application/json' and a
response_schema for structured output. Retries on transient errors (429
rate-limit in particular, which hits hard during demos on free-tier keys).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import google.generativeai as genai

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_configured = False

MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 8.0  # seconds


def _configure() -> bool:
    global _configured
    if _configured:
        return True
    key = get_settings().GEMINI_API_KEY
    if not key:
        logger.warning("GEMINI_API_KEY not set — using stub responses")
        return False
    genai.configure(api_key=key)
    _configured = True
    return True


def _parse_retry_delay(err_msg: str) -> float | None:
    """Pull 'Please retry in 21.4s' out of a Gemini quota error."""
    m = re.search(r"retry in (\d+(?:\.\d+)?)", err_msg)
    if m:
        try:
            return float(m.group(1)) + 0.5
        except ValueError:
            return None
    m = re.search(r"seconds: (\d+)", err_msg)
    if m:
        try:
            return float(m.group(1)) + 0.5
        except ValueError:
            return None
    return None


async def generate_json(
    system_instruction: str,
    contents: list[dict[str, Any]],
    response_schema: dict[str, Any],
    *,
    model: str | None = None,
    temperature: float = 0.4,
) -> dict[str, Any]:
    """Run Gemini and return the parsed JSON object. Retries on 429."""
    settings = get_settings()
    if not _configure():
        return _stub_response(response_schema)

    model_name = model or settings.GEMINI_MODEL
    gen_config = {
        "response_mime_type": "application/json",
        "response_schema": response_schema,
        "temperature": temperature,
    }

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            m = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction,
                generation_config=gen_config,
            )
            resp = await m.generate_content_async(contents)
            return json.loads(resp.text)
        except Exception as e:  # noqa: BLE001
            last_error = e
            msg = str(e)
            is_quota = "429" in msg or "ResourceExhausted" in type(e).__name__
            if is_quota and attempt < MAX_RETRIES - 1:
                delay = _parse_retry_delay(msg) or DEFAULT_RETRY_DELAY * (attempt + 1)
                logger.warning(
                    "Gemini 429 — retrying in %.1fs (attempt %d/%d)",
                    delay,
                    attempt + 1,
                    MAX_RETRIES,
                )
                await asyncio.sleep(delay)
                continue
            break

    logger.exception("Gemini call failed permanently: %s", last_error)
    return _stub_response(response_schema, error=str(last_error))


def _stub_response(schema: dict[str, Any], error: str | None = None) -> dict[str, Any]:
    """Minimal stub that satisfies our known schemas."""
    props = (schema or {}).get("properties", {})
    if "reply_text" in props:
        return {
            "reply_text": "Sorry, the system is busy. Please try again in a moment.",
            "extracted_fields": {},
            "is_complete": False,
        }
    if "triage_flags" in props and "chief_complaint" not in props:
        return {"triage_flags": [], "reasoning": "stub: classifier offline"}
    if "chief_complaint" in props:
        return {
            "chief_complaint": "Pending summary",
            "hpi_paragraph": "Summary service unavailable.",
            "relevant_history": [],
            "triage_assessment": "Not evaluated.",
            "followup_delta": None,
            "suggested_questions": [],
            "differentials": [],
        }
    return {}
