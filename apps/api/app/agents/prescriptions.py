"""Prescription Agent — turns the SOAP Plan + patient context into a typed
list of prescription drafts via Featherless.

Llama-3.1-8B handles JSON-only output well when you ask explicitly and give
a tight schema. We add a tolerant JSON extractor so a stray ```json fence or
preamble doesn't blow up the parse.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.integrations import featherless

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are a clinical pharmacist drafting prescriptions for an outpatient "
    "consultation. Given the SOAP note plan, patient context, and previous "
    "prescriptions, emit a JSON array of prescription objects. Output ONLY "
    "the JSON array — no preamble, no markdown fences, no commentary.\n\n"
    "Each object MUST have exactly these fields, in this shape:\n"
    "  {\n"
    "    \"drug_name\": string — generic name preferred (e.g. \"Amlodipine\")\n"
    "    \"dose\": string — strength + unit (e.g. \"5 mg\")\n"
    "    \"frequency\": string — natural-language schedule (e.g. \"Once daily, morning\")\n"
    "    \"duration_days\": integer — total days; use 30 for chronic\n"
    "    \"instructions\": string — short patient-facing note (e.g. \"Take with food\")\n"
    "    \"rationale\": string — one short sentence explaining WHY this drug\n"
    "  }\n\n"
    "RULES:\n"
    "- Prefer drugs already used in previous visits when adherence is good.\n"
    "- Match the SOAP Plan — don't invent drugs that contradict it.\n"
    "- If the Plan does not call for medication, return an empty array [].\n"
    "- Maximum 6 entries. No duplicates.\n"
    "- Never include controlled substances unless the plan explicitly does.\n"
    "- Use generic names; over-the-counter items (e.g. paracetamol) are fine."
)


_JSON_ARRAY = re.compile(r"\[\s*(?:\{.*?\}\s*,?\s*)+\]", re.DOTALL)


def _extract_json_array(text: str) -> list[dict[str, Any]]:
    if not text:
        return []
    cleaned = text.strip()
    # Strip ```json ... ``` fences if present
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    # Try direct parse first
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "prescriptions" in parsed:
            return parsed["prescriptions"] or []
    except json.JSONDecodeError:
        pass
    # Fallback: extract the first JSON array substring
    m = _JSON_ARRAY.search(cleaned)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    return []


def _normalize(item: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    drug = (item.get("drug_name") or item.get("name") or "").strip()
    dose = (item.get("dose") or "").strip()
    freq = (item.get("frequency") or "").strip()
    raw_dur = item.get("duration_days")
    try:
        duration = int(raw_dur) if raw_dur is not None else 0
    except (TypeError, ValueError):
        duration = 0
    if not drug or not dose or not freq or duration <= 0:
        return None
    return {
        "drug_name": drug[:255],
        "dose": dose[:64],
        "frequency": freq[:64],
        "duration_days": min(duration, 365),
        "instructions": (item.get("instructions") or "").strip()[:1000] or None,
        "rationale": (item.get("rationale") or "").strip()[:500] or None,
    }


def build_user_prompt(
    patient_block: str,
    summary: dict[str, Any] | None,
    soap_plan: str | None,
    previous_rx_block: str | None,
) -> str:
    parts = ["=== PATIENT ===", patient_block]
    if previous_rx_block:
        parts += ["", "=== PREVIOUS PRESCRIPTIONS ===", previous_rx_block]
    if summary:
        parts += [
            "",
            "=== PRE-VISIT SUMMARY ===",
            f"Chief complaint: {summary.get('chief_complaint', '-')}",
            f"HPI: {summary.get('hpi_paragraph', '-')}",
        ]
        diffs = summary.get("differentials") or []
        if diffs:
            parts.append("Differentials: " + "; ".join(diffs))
    if soap_plan:
        parts += ["", "=== SOAP PLAN ===", soap_plan]
    else:
        parts += [
            "",
            "=== SOAP PLAN ===",
            "(no SOAP note drafted yet — infer the plan from the pre-visit summary)",
        ]
    parts += ["", "Return the JSON array now."]
    return "\n".join(parts)


async def draft_prescriptions(
    patient_block: str,
    summary: dict[str, Any] | None,
    soap_plan: str | None,
    previous_rx_block: str | None,
) -> list[dict[str, Any]]:
    user = build_user_prompt(
        patient_block, summary, soap_plan, previous_rx_block
    )
    text = await featherless.chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
        max_tokens=800,
        temperature=0.2,
    )
    raw = _extract_json_array(text)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw[:6]:
        norm = _normalize(item)
        if norm is None:
            continue
        key = norm["drug_name"].lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(norm)
    return out
