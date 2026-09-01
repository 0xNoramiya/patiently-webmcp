"""Reminder Agent — generates friendly appointment nudges via OpenAI.

Runs on a cron schedule. For each reminder whose scheduled_for has passed,
we ask a small open-source model to draft a 2-sentence SMS-style message
that:
  - greets the patient by name
  - mentions the appointment date + reason
  - references the previous visit when available

A short system+user message is all this needs
pair.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from app.integrations import openai_client
from app.models.patient import Patient
from app.models.reminder import AppointmentReminder
from app.models.visit import Visit

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are Patiently's appointment-reminder writer. Draft short, warm "
    "SMS-style reminders for outpatient clinic patients. Hard rules:\n"
    "- 2 short sentences, max 280 characters total.\n"
    "- Greet the patient by their first name (e.g. 'Hi Sarah,').\n"
    "- Confirm the appointment date and time in a natural way.\n"
    "- Mention the reason or the previous visit if context is provided.\n"
    "- End with a calm, low-friction call to action like 'Reply STOP to cancel'.\n"
    "- No emojis. No medical advice. No marketing language."
)


def _first_name(full: str) -> str:
    return (full or "").split()[0] if full else ""


def _format_dt(dt: datetime) -> str:
    return dt.strftime("%A, %B %d at %-I:%M %p").replace(" 0", " ")


def build_user_prompt(
    reminder: AppointmentReminder,
    patient: Patient,
    previous_visit: Visit | None,
) -> str:
    lines = [
        f"Patient first name: {_first_name(patient.name)}",
        f"Appointment: {_format_dt(reminder.appointment_at)}",
        f"Reason: {reminder.reason}",
        f"Channel: {reminder.channel}",
    ]
    if previous_visit:
        rx_summary = ", ".join(
            f"{rx.drug_name} {rx.dose} for {rx.duration_days}d"
            for rx in previous_visit.prescriptions
        ) or "no medications"
        lines += [
            "Previous visit context:",
            f"  - Date: {previous_visit.visit_date.isoformat()}",
            f"  - Complaint: {previous_visit.chief_complaint}",
            f"  - Prescribed: {rx_summary}",
        ]
    lines.append("\nWrite the reminder message now. Plain text only.")
    return "\n".join(lines)


async def generate_message(
    reminder: AppointmentReminder,
    patient: Patient,
    previous_visit: Visit | None = None,
) -> dict[str, Any]:
    """Call the model. Returns {message, model_used}."""
    user = build_user_prompt(reminder, patient, previous_visit)
    text = await openai_client.chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
        max_tokens=180,
        temperature=0.5,
    )
    # Strip any accidental markdown emphasis the model might add.
    cleaned = text.replace("**", "").strip().strip('"').strip()
    return {"message": cleaned, "model_used": "openai"}
