"""Vital-signs critical-finding detection is a safety rail: a missed
hypertensive crisis or hypoxia at intake puts the patient at the bottom of
the queue when they should be at the top. Pure-function tests."""
from __future__ import annotations

import pytest

from app.services.vitals import CRITICAL_LABELS, detect_critical


def test_no_findings_when_vitals_normal():
    assert (
        detect_critical(
            {
                "systolic_bp": 120,
                "diastolic_bp": 78,
                "heart_rate": 72,
                "respiratory_rate": 16,
                "temperature_c": 37.0,
                "spo2": 98,
                "pain_score": 2,
            }
        )
        == []
    )


def test_hypertensive_crisis_on_sbp():
    flags = detect_critical({"systolic_bp": 200, "diastolic_bp": 95})
    assert "HYPERTENSIVE_CRISIS" in flags


def test_hypertensive_crisis_on_dbp():
    flags = detect_critical({"systolic_bp": 150, "diastolic_bp": 125})
    assert "HYPERTENSIVE_CRISIS" in flags


def test_hypotension_below_90_sbp():
    flags = detect_critical({"systolic_bp": 80, "diastolic_bp": 55})
    assert "HYPOTENSION" in flags


def test_severe_tachycardia():
    assert "SEVERE_TACHYCARDIA" in detect_critical({"heart_rate": 145})


def test_bradycardia():
    assert "BRADYCARDIA" in detect_critical({"heart_rate": 42})


def test_hypoxia_threshold_92():
    assert "HYPOXIA" in detect_critical({"spo2": 91})
    assert "HYPOXIA" not in detect_critical({"spo2": 92})


def test_tachypnea_threshold_24():
    assert "TACHYPNEA" in detect_critical({"respiratory_rate": 28})
    assert "TACHYPNEA" not in detect_critical({"respiratory_rate": 18})


def test_high_fever_threshold():
    assert "HIGH_FEVER" in detect_critical({"temperature_c": 39.5})
    assert "HIGH_FEVER" not in detect_critical({"temperature_c": 38.7})


def test_hypothermia_threshold():
    assert "HYPOTHERMIA" in detect_critical({"temperature_c": 34.5})
    assert "HYPOTHERMIA" not in detect_critical({"temperature_c": 36.1})


def test_severe_pain_threshold_8():
    assert "SEVERE_PAIN" in detect_critical({"pain_score": 9})
    assert "SEVERE_PAIN" not in detect_critical({"pain_score": 7})


def test_missing_fields_dont_throw():
    # A nurse may only record BP — none of the others should false-fire.
    flags = detect_critical({"systolic_bp": 200})
    assert flags == ["HYPERTENSIVE_CRISIS"]


def test_multiple_critical_findings_combine():
    flags = detect_critical(
        {
            "systolic_bp": 190,
            "spo2": 88,
            "temperature_c": 39.6,
            "heart_rate": 140,
        }
    )
    assert set(flags) == {
        "HYPERTENSIVE_CRISIS",
        "HYPOXIA",
        "HIGH_FEVER",
        "SEVERE_TACHYCARDIA",
    }


def test_every_code_has_label():
    for code in [
        "HYPERTENSIVE_CRISIS",
        "HYPOTENSION",
        "SEVERE_TACHYCARDIA",
        "BRADYCARDIA",
        "HYPOXIA",
        "TACHYPNEA",
        "HIGH_FEVER",
        "HYPOTHERMIA",
        "SEVERE_PAIN",
    ]:
        assert code in CRITICAL_LABELS
        assert len(CRITICAL_LABELS[code]) > 5


@pytest.mark.parametrize(
    "vital,expected",
    [
        ({"systolic_bp": 180}, "HYPERTENSIVE_CRISIS"),
        ({"diastolic_bp": 120}, "HYPERTENSIVE_CRISIS"),
        ({"heart_rate": 130}, "SEVERE_TACHYCARDIA"),
        ({"heart_rate": 49}, "BRADYCARDIA"),
        ({"spo2": 91}, "HYPOXIA"),
        ({"temperature_c": 39.0}, "HIGH_FEVER"),
        ({"temperature_c": 34.99}, "HYPOTHERMIA"),
        ({"pain_score": 8}, "SEVERE_PAIN"),
    ],
)
def test_boundary_values(vital, expected):
    assert expected in detect_critical(vital)
