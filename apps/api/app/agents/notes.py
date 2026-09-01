"""Notes Agent — drafts a SOAP-format consultation note via Featherless.

Inputs: patient profile + pre-visit summary (from Summarizer Agent) +
transcript text (from Speechmatics, if available) + previous-visit context.
Output: 4 short paragraphs labelled Subjective / Objective / Assessment / Plan.

We deliberately keep the response shape boring (4 sections, plain text) so the
model is forced to produce something pasteable into any EMR.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from app.integrations import featherless

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are a clinical scribe drafting a SOAP-format consultation note for an "
    "outpatient visit. You receive the patient profile, the pre-visit summary "
    "written by an intake agent, an optional transcript of the doctor-patient "
    "conversation, and any previous-visit context. Produce a concise SOAP note "
    "for the physician to review and sign.\n\n"
    "FORMAT — return the four sections in EXACTLY this order, each preceded by "
    "its label on its own line:\n"
    "Subjective:\n<paragraph>\n\n"
    "Objective:\n<paragraph>\n\n"
    "Assessment:\n<paragraph>\n\n"
    "Plan:\n<paragraph>\n\n"
    "RULES:\n"
    "- 2-4 sentences per section. No bullets unless a Plan list is genuinely "
    "  helpful.\n"
    "- Subjective = patient's own words about the complaint, history, and any "
    "  follow-up adherence/response.\n"
    "- Objective = exam findings if mentioned in the transcript; otherwise "
    "  state 'Vitals and exam findings to be completed by the clinician.'\n"
    "- Assessment = clinical reasoning with 1-2 differentials. Use ICD-10 "
    "  codes parenthetically where obvious. Do NOT diagnose definitively when "
    "  the data is thin.\n"
    "- Plan = next steps. Include medications (drug, dose, freq, duration), "
    "  investigations, return precautions, and follow-up timeline.\n"
    "- Never invent vitals or labs that aren't in the input.\n"
    "- Stay in clinical English. No emojis. No marketing."
)


SECTION_RE = re.compile(
    r"(?ms)^(?P<label>Subjective|Objective|Assessment|Plan)\s*:\s*\n?(?P<body>.*?)(?=\n^(?:Subjective|Objective|Assessment|Plan)\s*:|\Z)"
)


def parse_soap(raw: str) -> dict[str, str]:
    """Split the model's text into the four named sections. Tolerant of extra
    whitespace, missing trailing sections, and markdown asterisks the model
    sometimes adds despite being told not to."""
    cleaned = raw.replace("**", "").strip()
    out: dict[str, str] = {
        "subjective": "",
        "objective": "",
        "assessment": "",
        "plan": "",
    }
    for m in SECTION_RE.finditer(cleaned):
        out[m.group("label").lower()] = m.group("body").strip()
    return out


def build_user_prompt(
    patient_block: str,
    intake_summary: dict[str, Any] | None,
    transcript_text: str | None,
    previous_visit_block: str | None,
) -> str:
    parts = ["=== PATIENT ===", patient_block]
    if previous_visit_block:
        parts += ["", "=== PREVIOUS VISIT ===", previous_visit_block]
    if intake_summary:
        parts += [
            "",
            "=== PRE-VISIT SUMMARY (Intake + Triage agents) ===",
            f"Chief complaint: {intake_summary.get('chief_complaint', '-')}",
            f"HPI: {intake_summary.get('hpi_paragraph', '-')}",
            f"Triage: {intake_summary.get('triage_assessment', '-')}",
        ]
        diffs = intake_summary.get("differentials") or []
        if diffs:
            parts.append("Differentials considered: " + "; ".join(diffs))
    if transcript_text:
        parts += ["", "=== CONSULTATION TRANSCRIPT ===", transcript_text]
    else:
        parts += [
            "",
            "=== CONSULTATION TRANSCRIPT ===",
            "(no transcript available — produce the best note you can from the pre-visit data)",
        ]
    parts += [
        "",
        "Draft the SOAP note now. Use the exact section labels.",
    ]
    return "\n".join(parts)


async def draft_note(
    patient_block: str,
    intake_summary: dict[str, Any] | None,
    transcript_text: str | None,
    previous_visit_block: str | None,
) -> dict[str, Any]:
    user = build_user_prompt(
        patient_block, intake_summary, transcript_text, previous_visit_block
    )
    text = await featherless.chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
        max_tokens=600,
        temperature=0.4,
    )
    parsed = parse_soap(text)
    return {**parsed, "raw_response": text, "model_used": "featherless"}
