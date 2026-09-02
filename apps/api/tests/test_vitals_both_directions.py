"""Every vital is bounded on both sides.

Testing the flagger against low values as well as high found that respiratory
rate had only a ceiling: RR 24 raised tachypnea, RR 6 raised nothing at all. A
respiratory rate of six is a peri-arrest finding — opioid or CNS depression —
and the chart said the patient was fine.

Blood pressure, heart rate and temperature were already bounded both ways, which
is what made the gap look like an oversight rather than a decision.
"""
from __future__ import annotations

import pytest

from app.services.vitals import CRITICAL_LABELS, detect_critical


@pytest.mark.parametrize(
    "label,vitals,expected",
    [
        ("hypertensive crisis", {"systolic_bp": 210, "diastolic_bp": 125}, "HYPERTENSIVE_CRISIS"),
        ("hypotension / shock", {"systolic_bp": 78}, "HYPOTENSION"),
        ("severe tachycardia", {"heart_rate": 140}, "SEVERE_TACHYCARDIA"),
        ("bradycardia", {"heart_rate": 38}, "BRADYCARDIA"),
        ("hypoxia", {"spo2": 86}, "HYPOXIA"),
        ("tachypnea", {"respiratory_rate": 30}, "TACHYPNEA"),
        ("bradypnea", {"respiratory_rate": 6}, "BRADYPNEA"),
        ("high fever", {"temperature_c": 39.8}, "HIGH_FEVER"),
        ("hypothermia", {"temperature_c": 34.1}, "HYPOTHERMIA"),
        ("severe pain", {"pain_score": 9}, "SEVERE_PAIN"),
    ],
)
def test_each_critical_finding_is_detected(label, vitals, expected):
    assert expected in detect_critical(vitals), f"{label} went unflagged"


@pytest.mark.parametrize(
    "vital,low_flag,high_flag",
    [
        ("systolic_bp", "HYPOTENSION", "HYPERTENSIVE_CRISIS"),
        ("heart_rate", "BRADYCARDIA", "SEVERE_TACHYCARDIA"),
        ("respiratory_rate", "BRADYPNEA", "TACHYPNEA"),
        ("temperature_c", "HYPOTHERMIA", "HIGH_FEVER"),
    ],
)
def test_every_bounded_vital_is_bounded_on_both_sides(vital, low_flag, high_flag):
    """The check that would have caught the bradypnea gap."""
    assert low_flag in CRITICAL_LABELS, f"{vital} has no low-side finding"
    assert high_flag in CRITICAL_LABELS, f"{vital} has no high-side finding"


def test_normal_vitals_raise_nothing():
    assert detect_critical({
        "systolic_bp": 118, "diastolic_bp": 76, "heart_rate": 72,
        "spo2": 98, "respiratory_rate": 16, "temperature_c": 36.8, "pain_score": 2,
    }) == []


def test_borderline_values_are_not_critical():
    """False positives train clinicians to dismiss the panel."""
    assert detect_critical({
        "systolic_bp": 138, "heart_rate": 95, "spo2": 94,
        "respiratory_rate": 22, "temperature_c": 37.6, "pain_score": 6,
    }) == []


@pytest.mark.parametrize("rr,flagged", [(7, True), (8, False), (23, False), (24, True)])
def test_the_respiratory_boundaries_are_exact(rr, flagged):
    assert bool(detect_critical({"respiratory_rate": rr})) is flagged


def test_missing_values_are_not_treated_as_zero():
    """An unrecorded vital must not read as a critical one."""
    assert detect_critical({}) == []
    assert detect_critical({"heart_rate": None, "systolic_bp": None,
                            "respiratory_rate": None, "temperature_c": None}) == []


def test_every_code_has_a_human_readable_label():
    """The codes reach a clinician's screen and the PDF."""
    everything = detect_critical({
        "systolic_bp": 60, "heart_rate": 200, "spo2": 70,
        "respiratory_rate": 4, "temperature_c": 41.0, "pain_score": 10,
    })
    assert everything
    for code in everything:
        assert CRITICAL_LABELS.get(code), f"{code} has no label"
