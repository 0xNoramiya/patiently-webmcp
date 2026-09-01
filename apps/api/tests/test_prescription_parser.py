"""The prescription parser is the line of defense between a chatty LLM and
the doctor's order sheet. A bad parse here yields silent-empty prescriptions
or worse, an invalid drug in the chart. Pure-function tests."""
from __future__ import annotations

import pytest

from app.agents.prescriptions import _extract_json_array, _normalize


def test_direct_json_array_parse():
    out = _extract_json_array(
        '[{"drug_name": "Amlodipine", "dose": "5 mg"}]'
    )
    assert len(out) == 1
    assert out[0]["drug_name"] == "Amlodipine"


def test_json_with_markdown_fence():
    raw = '```json\n[{"drug_name": "Paracetamol", "dose": "500 mg"}]\n```'
    out = _extract_json_array(raw)
    assert len(out) == 1
    assert out[0]["drug_name"] == "Paracetamol"


def test_json_with_plain_fence():
    raw = '```\n[{"drug_name": "Ibuprofen", "dose": "400 mg"}]\n```'
    out = _extract_json_array(raw)
    assert len(out) == 1


def test_object_with_prescriptions_key_unwrapped():
    raw = '{"prescriptions": [{"drug_name": "Aspirin", "dose": "81 mg"}]}'
    out = _extract_json_array(raw)
    assert len(out) == 1
    assert out[0]["drug_name"] == "Aspirin"


def test_json_array_embedded_in_preamble():
    raw = (
        "Here are the prescriptions:\n"
        '[{"drug_name": "Amoxicillin", "dose": "500 mg"}, '
        '{"drug_name": "Paracetamol", "dose": "1 g"}]\n'
        "End of list."
    )
    out = _extract_json_array(raw)
    assert len(out) == 2


def test_empty_returns_empty_list():
    assert _extract_json_array("") == []
    assert _extract_json_array("no prescriptions needed") == []


def test_malformed_returns_empty():
    assert _extract_json_array("{not valid") == []


def test_normalize_drops_missing_required_fields():
    assert _normalize({"drug_name": "X"}) is None  # no dose/freq/duration
    assert _normalize({}) is None
    assert _normalize("not a dict") is None  # type: ignore[arg-type]


def test_normalize_requires_positive_duration():
    bad = {
        "drug_name": "Test",
        "dose": "5 mg",
        "frequency": "Daily",
        "duration_days": 0,
    }
    assert _normalize(bad) is None
    bad["duration_days"] = -1
    assert _normalize(bad) is None


def test_normalize_caps_duration_at_365():
    item = {
        "drug_name": "Chronic Med",
        "dose": "10 mg",
        "frequency": "Daily",
        "duration_days": 9999,
    }
    out = _normalize(item)
    assert out is not None
    assert out["duration_days"] == 365


def test_normalize_handles_string_duration():
    item = {
        "drug_name": "X",
        "dose": "5 mg",
        "frequency": "Daily",
        "duration_days": "14",
    }
    out = _normalize(item)
    assert out is not None
    assert out["duration_days"] == 14


def test_normalize_nullifies_empty_optional_fields():
    item = {
        "drug_name": "X",
        "dose": "5 mg",
        "frequency": "Daily",
        "duration_days": 7,
        "instructions": "",
        "rationale": "  ",
    }
    out = _normalize(item)
    assert out is not None
    assert out["instructions"] is None
    assert out["rationale"] is None


def test_normalize_truncates_overlong_strings():
    item = {
        "drug_name": "X" * 400,
        "dose": "5 mg",
        "frequency": "D",
        "duration_days": 5,
    }
    out = _normalize(item)
    assert out is not None
    assert len(out["drug_name"]) == 255


@pytest.mark.parametrize(
    "raw,expected_first_drug",
    [
        ('[{"drug_name":"A","dose":"1","frequency":"D","duration_days":1}]', "A"),
        (
            '```json\n[{"drug_name":"B","dose":"2","frequency":"D","duration_days":1}]\n```',
            "B",
        ),
    ],
)
def test_end_to_end_extract_then_normalize(raw, expected_first_drug):
    items = _extract_json_array(raw)
    assert items
    normalized = [n for n in (_normalize(i) for i in items) if n]
    assert normalized[0]["drug_name"] == expected_first_drug
