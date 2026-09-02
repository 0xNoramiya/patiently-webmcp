"""Every advertised red flag must be real.

The classifier advertises eight codes and, for seventeen iterations, only
CHEST_PAIN_CARDIAC had ever been observed firing. All eight were then exercised
against real models on production with realistic patient wording; each returned
exactly its own code and nothing else.

These tests hold the surrounding contract — the parts that do not need a model
call, and that would silently rot if a code were added to the prompt without a
priority, or dropped from a label map.
"""
from __future__ import annotations

import pytest

from app.agents.schemas import TRIAGE_RESPONSE_SCHEMA
from app.services.triage import RED_FLAG_LABEL, RED_FLAG_PRIORITY, max_priority_for

CODES = sorted(TRIAGE_RESPONSE_SCHEMA["properties"]["triage_flags"]["items"]["enum"])


def test_the_schema_advertises_the_codes_we_think_it_does():
    assert len(CODES) == 8


@pytest.mark.parametrize("code", CODES)
def test_every_advertised_code_can_actually_escalate(code):
    """A code the classifier can return but the queue ignores is a red flag that
    does nothing — the worst kind, because the ticket looks screened."""
    assert RED_FLAG_PRIORITY.get(code, 0) > 0, f"{code} maps to no priority"


@pytest.mark.parametrize("code", CODES)
def test_every_advertised_code_has_a_human_label(code):
    """These strings reach the clinician's dashboard, the agent's tool output and
    the printed chart."""
    assert RED_FLAG_LABEL.get(code), f"{code} has no label"
    assert RED_FLAG_LABEL[code] != code


def test_no_priority_or_label_exists_for_a_code_the_classifier_cannot_return():
    """Dead entries mean the prompt and the queue have drifted apart."""
    assert set(RED_FLAG_PRIORITY) == set(CODES)
    assert set(RED_FLAG_LABEL) == set(CODES)


def test_obstetric_bleeding_and_suicidal_ideation_are_not_second_tier():
    """They used to sit at 50, behind severe dehydration at 100. Bleeding in
    pregnancy can be abruption; someone who has just disclosed suicidal ideation
    should not wait behind a queue."""
    assert RED_FLAG_PRIORITY["OBSTETRIC_BLEEDING"] == 100
    assert RED_FLAG_PRIORITY["SUICIDAL_IDEATION"] == 100


def test_the_highest_flag_wins_when_several_fire():
    assert max_priority_for(["SUICIDAL_IDEATION", "CHEST_PAIN_CARDIAC"]) == 100
    assert max_priority_for([]) == 0
    assert max_priority_for(["NOT_A_REAL_CODE"]) == 0


def test_an_unknown_code_cannot_silently_escalate_a_ticket():
    """A hallucinated code must not move anyone up the queue."""
    assert max_priority_for(["URGENT", "EMERGENCY", "PRIORITY_100"]) == 0
