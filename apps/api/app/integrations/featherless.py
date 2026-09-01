"""Featherless inference client.

OpenAI-compatible API at https://api.featherless.ai/v1. We use it for the
scheduled appointment-reminder workflow — short, friendly nudges generated
by a smaller open-source model so we don't burn Gemini quota for chat that
doesn't need clinical reasoning.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.featherless.ai/v1"
DEFAULT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"


class FeatherlessError(Exception):
    pass


async def chat(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    max_tokens: int = 220,
    temperature: float = 0.6,
    timeout: float = 30.0,
) -> str:
    """Run a chat completion. Returns assistant message content."""
    settings = get_settings()
    api_key = settings.FEATHERLESS_API_KEY
    if not api_key:
        raise FeatherlessError("FEATHERLESS_API_KEY not configured")

    payload: dict[str, Any] = {
        "model": model or settings.FEATHERLESS_MODEL or DEFAULT_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{BASE_URL}/chat/completions", json=payload, headers=headers
        )
        if resp.status_code != 200:
            logger.error(
                "Featherless %s: %s", resp.status_code, resp.text[:300]
            )
            raise FeatherlessError(
                f"Featherless returned {resp.status_code}: {resp.text[:300]}"
            )
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError) as e:
            raise FeatherlessError(f"unexpected response shape: {e}; {data}")
