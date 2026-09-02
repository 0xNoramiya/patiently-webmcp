"""Triage Agent — independent clinical-safety classifier.

Defense in depth: even if the Intake Agent gets distracted, drifts, or is
"role-played" past a danger sign by the patient, the Triage Agent runs
independently on each patient turn with a focused prompt and its own
response schema. Returns a list of red-flag codes that fire on THIS turn,
plus a short reasoning string for audit.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from app.core.config import get_settings
from app.integrations.openai_client import DEGRADED_KEY, generate_json
from app.agents.schemas import TRIAGE_RESPONSE_SCHEMA

_PROMPT_PATH = os.path.join(
    os.path.dirname(__file__), "prompts", "triage_system.txt"
)
logger = logging.getLogger(__name__)

with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
    TRIAGE_SYSTEM_PROMPT = f.read()


@dataclass
class TriageVerdict:
    flags: list[str]
    reasoning: str
    #: False when the classifier could not be reached. An empty `flags` with
    #: `ran=False` means "nobody checked", NOT "nothing was found" — the two
    #: must never be collapsed, because one of them is a patient nobody looked at.
    ran: bool = True


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
        model=get_settings().OPENAI_MODEL_TRIAGE,
        temperature=0.0,  # deterministic classifier
    )

    degraded = bool(result.get(DEGRADED_KEY))
    raw_flags = result.get("triage_flags") or []
    raised_set = set(already_raised)
    new_flags = [f for f in raw_flags if f not in raised_set]
    reasoning = (result.get("reasoning") or "").strip()

    if degraded:
        logger.error(
            "Triage classifier unavailable — this turn was NOT screened for red flags."
        )

    return TriageVerdict(flags=new_flags, reasoning=reasoning, ran=not degraded)
