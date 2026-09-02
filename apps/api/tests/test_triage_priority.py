"""Triage priority mapping is the load-bearing safety primitive: a misfire here
is the difference between a chest-pain patient jumping the queue and waiting
30 minutes behind a knee-pain follow-up. These are pure-function tests."""
from __future__ import annotations

import pytest

from app.services.triage import (
    RED_FLAG_PRIORITY,
    flag_label,
    max_priority_for,
)


def test_critical_flags_get_priority_100():
    critical = {
        "CHEST_PAIN_CARDIAC",
        "STROKE_SYMPTOMS",
        "RESPIRATORY_DISTRESS",
        "ANAPHYLAXIS_SUSPECT",
        "PEDS_RED_FLAG",
        "SEVERE_DEHYDRATION",
    }
    for code in critical:
        assert RED_FLAG_PRIORITY[code] == 100, f"{code} must be critical"


def test_no_red_flag_is_second_tier():
    """These two used to be 50, behind severe dehydration at 100.

    Nothing recorded why. Bleeding at 22 weeks can be abruption or previa, and
    someone who has just disclosed suicidal ideation should not sit in a waiting
    room behind a queue. Every code in the table is a red flag by construction,
    so a lower tier needed a clinical rationale and had none.
    """
    assert RED_FLAG_PRIORITY["OBSTETRIC_BLEEDING"] == 100
    assert RED_FLAG_PRIORITY["SUICIDAL_IDEATION"] == 100
    assert set(RED_FLAG_PRIORITY.values()) == {100}


def test_max_priority_picks_highest_when_multiple_fire():
    assert max_priority_for(["SUICIDAL_IDEATION", "CHEST_PAIN_CARDIAC"]) == 100


def test_max_priority_zero_when_no_flags():
    assert max_priority_for([]) == 0


def test_max_priority_zero_when_only_unknown_flags():
    assert max_priority_for(["NOT_A_REAL_CODE"]) == 0


def test_flag_label_returns_english_for_known_codes():
    assert "coronary" in flag_label("CHEST_PAIN_CARDIAC").lower()
    assert "stroke" in flag_label("STROKE_SYMPTOMS").lower()


def test_flag_label_falls_back_to_code_for_unknown():
    assert flag_label("MADE_UP_FLAG") == "MADE_UP_FLAG"


@pytest.mark.parametrize(
    "flags,expected",
    [
        (["CHEST_PAIN_CARDIAC"], 100),
        (["OBSTETRIC_BLEEDING"], 100),
        (["OBSTETRIC_BLEEDING", "STROKE_SYMPTOMS"], 100),
        (["SUICIDAL_IDEATION"], 100),
        ([], 0),
    ],
)
def test_priority_table(flags, expected):
    assert max_priority_for(flags) == expected
