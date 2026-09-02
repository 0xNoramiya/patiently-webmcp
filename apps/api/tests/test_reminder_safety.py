"""Constraints on the one piece of generated text aimed at a patient.

Every other write in this system stops for a human click. Appointment reminders
do not — the scheduler drafts them on a timer. That is defensible because they
are administrative rather than clinical, but only while the prompt keeps them
that way, so the constraints are pinned here rather than left to whoever edits
the prompt next.

Read against real output on production, the generated messages look like:

    "Hi Henry, just a reminder of your hypertension follow-up for a BP recheck
     on Wednesday, September 16 at 5:06 AM. Reply STOP to cancel."
"""
from __future__ import annotations

import pytest

from app.agents.reminder import SYSTEM_PROMPT


@pytest.mark.parametrize(
    "requirement,needle",
    [
        ("no medical advice", "no medical advice"),
        ("an opt-out", "stop to cancel"),
        ("a length cap", "280 characters"),
        ("first-name greeting", "first name"),
        ("no emojis", "no emojis"),
        ("no marketing", "no marketing"),
    ],
)
def test_the_prompt_still_carries_its_constraints(requirement, needle):
    assert needle in SYSTEM_PROMPT.lower(), f"the reminder prompt lost: {requirement}"


def test_it_is_scoped_to_appointment_reminders_only():
    """Widening this into general patient messaging would put ungated generated
    text in front of a patient with no clinician in the loop."""
    lowered = SYSTEM_PROMPT.lower()
    assert "appointment-reminder" in lowered or "appointment reminder" in lowered
    assert "sms-style" in lowered


def test_the_cap_is_short_enough_to_stay_administrative():
    """A 280-character nudge cannot become a consultation."""
    import re

    cap = int(re.search(r"(\d+) characters", SYSTEM_PROMPT).group(1))
    assert cap <= 320
