"""OpenAI inference client.

One integration serves both LLM roles in Patiently:

  - ``generate_json`` — structured clinical output for the Intake, Triage and
    Summarizer agents. Uses Structured Outputs (``response_format`` with a
    ``json_schema``) so the model cannot return a shape the agents can't parse.
  - ``chat`` — free-text generation for SOAP notes, prescription rationales and
    appointment reminders, where the caller parses the prose itself.

Both retry on 429, which is the failure mode that actually bites during a live
demo. On permanent failure ``generate_json`` degrades to a schema-shaped stub so
the intake conversation stays alive instead of 500-ing at the patient.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 4.0  # seconds


class OpenAIError(Exception):
    pass


def _base_url() -> str:
    return get_settings().OPENAI_BASE_URL.rstrip("/")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {get_settings().OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }


def _parse_retry_delay(err_msg: str) -> float | None:
    """Pull 'Please try again in 21.4s' out of a rate-limit error body."""
    m = re.search(r"try again in (\d+(?:\.\d+)?)s", err_msg)
    if m:
        try:
            return float(m.group(1)) + 0.5
        except ValueError:
            return None
    return None


# --------------------------------------------------------------------------
# Schema translation
# --------------------------------------------------------------------------

def _strictify(node: Any) -> Any:
    """Rewrite an OpenAPI-flavoured schema into strict JSON Schema.

    OpenAI Structured Outputs is stricter than the schema dialect the agents
    were written against: every object must set ``additionalProperties: false``
    and list *every* property in ``required``. Fields that were genuinely
    optional become nullable instead, which preserves the agents' existing
    "absent means not yet known" semantics.
    """
    if not isinstance(node, dict):
        return node

    node = dict(node)
    nullable = node.pop("nullable", False)

    if node.get("type") == "object":
        props = {k: _strictify(v) for k, v in node.get("properties", {}).items()}
        required = set(node.get("required", []))
        # Anything the original schema left optional must still be emittable as
        # null, so widen its type rather than dropping it from `required`.
        for key, prop in props.items():
            if key not in required:
                props[key] = _make_nullable(prop)
        node["properties"] = props
        node["required"] = list(props.keys())
        node["additionalProperties"] = False
    elif node.get("type") == "array":
        node["items"] = _strictify(node.get("items", {}))

    return _make_nullable(node) if nullable else node


def _make_nullable(node: Any) -> Any:
    """Widen a schema node so ``null`` is a legal value."""
    if not isinstance(node, dict):
        return node
    node = dict(node)
    t = node.get("type")
    if isinstance(t, str) and t != "null":
        node["type"] = [t, "null"]
    return node


def _to_messages(
    system_instruction: str, contents: list[dict[str, Any]]
) -> list[dict[str, str]]:
    """Flatten the agents' ``{role, parts:[{text}]}`` turns into chat messages."""
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_instruction}
    ]
    for turn in contents:
        text = "\n".join(
            part.get("text", "")
            for part in turn.get("parts", [])
            if isinstance(part, dict)
        ).strip()
        if not text:
            continue
        role = "assistant" if turn.get("role") in ("model", "assistant") else "user"
        messages.append({"role": role, "content": text})
    return messages


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

async def generate_json(
    system_instruction: str,
    contents: list[dict[str, Any]],
    response_schema: dict[str, Any],
    *,
    model: str | None = None,
    temperature: float = 0.4,
    schema_name: str = "clinical_response",
) -> dict[str, Any]:
    """Run a structured-output completion and return the parsed JSON object."""
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set — using stub responses")
        return _stub_response(response_schema)

    payload = {
        "model": model or settings.OPENAI_MODEL,
        "messages": _to_messages(system_instruction, contents),
        "temperature": temperature,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": True,
                "schema": _strictify(response_schema),
            },
        },
    }

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            return await _post_json(payload)
        except OpenAIError as e:
            last_error = e
            msg = str(e)
            if "429" in msg and attempt < MAX_RETRIES - 1:
                delay = _parse_retry_delay(msg) or DEFAULT_RETRY_DELAY * (attempt + 1)
                logger.warning(
                    "OpenAI 429 — retrying in %.1fs (attempt %d/%d)",
                    delay, attempt + 1, MAX_RETRIES,
                )
                await asyncio.sleep(delay)
                continue
            # A rejected schema is not worth retrying with the same schema —
            # fall back to plain JSON mode with the shape in the prompt.
            if "response_format" in msg or "json_schema" in msg:
                logger.warning("Strict schema rejected, falling back to json_object")
                try:
                    return await _post_json(_as_json_object(payload, response_schema))
                except OpenAIError as fallback_error:
                    last_error = fallback_error
            break

    logger.exception("OpenAI call failed permanently: %s", last_error)
    return _stub_response(response_schema, error=str(last_error))


async def chat(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    max_tokens: int = 220,
    temperature: float = 0.6,
    timeout: float = 30.0,
) -> str:
    """Run a plain chat completion. Returns the assistant message content."""
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise OpenAIError("OPENAI_API_KEY not configured")

    payload: dict[str, Any] = {
        "model": model or settings.OPENAI_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            data = await _post(payload, timeout=timeout)
            return data["choices"][0]["message"]["content"].strip()
        except OpenAIError as e:
            last_error = e
            if "429" in str(e) and attempt < MAX_RETRIES - 1:
                delay = _parse_retry_delay(str(e)) or DEFAULT_RETRY_DELAY * (attempt + 1)
                await asyncio.sleep(delay)
                continue
            raise
        except (KeyError, IndexError) as e:
            raise OpenAIError(f"unexpected response shape: {e}") from e

    raise last_error or OpenAIError("chat failed")


# --------------------------------------------------------------------------
# Transport
# --------------------------------------------------------------------------

async def _post(payload: dict[str, Any], *, timeout: float = 45.0) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{_base_url()}/chat/completions", json=payload, headers=_headers()
        )
        if resp.status_code != 200:
            logger.error("OpenAI %s: %s", resp.status_code, resp.text[:300])
            raise OpenAIError(f"OpenAI returned {resp.status_code}: {resp.text[:300]}")
        return resp.json()


async def _post_json(payload: dict[str, Any]) -> dict[str, Any]:
    data = await _post(payload)
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise OpenAIError(f"unexpected response shape: {e}") from e
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise OpenAIError(f"model did not return JSON: {content[:200]}") from e


def _as_json_object(
    payload: dict[str, Any], response_schema: dict[str, Any]
) -> dict[str, Any]:
    """Downgrade a strict-schema payload to json_object mode."""
    payload = dict(payload)
    payload["response_format"] = {"type": "json_object"}
    messages = list(payload["messages"])
    messages[0] = {
        "role": "system",
        "content": (
            f"{messages[0]['content']}\n\n"
            "Reply with a single JSON object matching this schema exactly:\n"
            f"{json.dumps(response_schema)}"
        ),
    }
    payload["messages"] = messages
    return payload


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
