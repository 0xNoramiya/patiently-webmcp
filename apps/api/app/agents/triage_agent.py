"""Triage Agent — independent clinical-safety classifier.

Defense in depth: even if the Intake Agent gets distracted, drifts, or is
"role-played" past a danger sign by the patient, the Triage Agent runs
independently on each patient turn with a focused prompt and its own
response schema. Returns a list of red-flag codes that fire on THIS turn,
plus a short reasoning string for audit.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from app.integrations.openai_client import generate_json
from app.agents.schemas import TRIAGE_RESPONSE_SCHEMA

_PROMPT_PATH = os.path.join(
    os.path.dirname(__file__), "prompts", "triage_system.txt"
)
with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
    TRIAGE_SYSTEM_PROMPT = f.read()


@dataclass
class TriageVerdict:
    flags: list[str]
    reasoning: str


async def classify_turn(
    emr_context: str,
    prior_conversation: str,
    patient_message: str,
    already_raised: list[str],
) -> TriageVerdict:
    """Run the Triage Agent on a single patient turn.

    Returns flags raised ON THIS TURN ONLY (codes already in `already_raised`
    are filtered out from the result).
    """
    user_text = (
        "=== EMR CONTEXT ===\n"
        f"{emr_context}\n\n"
        "=== PRIOR CONVERSATION (for context only) ===\n"
        f"{prior_conversation or '(no prior turns)'}\n\n"
        "=== PATIENT MESSAGE THIS TURN ===\n"
        f"{patient_message}\n\n"
        "=== CODES ALREADY RAISED ===\n"
        f"{', '.join(already_raised) if already_raised else '(none)'}\n\n"
        "Return triage_flags for codes fired by THIS turn only. "
        "Do not repeat codes already raised."
    )

    result = await generate_json(
        system_instruction=TRIAGE_SYSTEM_PROMPT,
        contents=[{"role": "user", "parts": [{"text": user_text}]}],
        response_schema=TRIAGE_RESPONSE_SCHEMA,
        temperature=0.0,  # deterministic classifier
    )

    raw_flags = result.get("triage_flags") or []
    raised_set = set(already_raised)
    new_flags = [f for f in raw_flags if f not in raised_set]
    reasoning = (result.get("reasoning") or "").strip()
    return TriageVerdict(flags=new_flags, reasoning=reasoning)
