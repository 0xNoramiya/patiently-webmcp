"""The reminder prompt is sent to Featherless on every scheduler tick.
If it drops the patient name, drops the appointment date, or starts injecting
unsanitized EMR text, a real SMS would go out wrong. Test the wiring."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.agents.reminder import _first_name, _format_dt, build_user_prompt


def test_first_name_takes_the_first_token():
    assert _first_name("Sarah Walters") == "Sarah"
    assert _first_name("Henry") == "Henry"
    assert _first_name("Mary Jane Watson") == "Mary"


def test_first_name_handles_empty():
    assert _first_name("") == ""
    assert _first_name(None) == ""


def test_format_dt_emits_readable_string():
    dt = datetime(2026, 5, 24, 14, 30, tzinfo=timezone.utc)
    s = _format_dt(dt)
    # Should be roughly "Sunday, May 24 at 2:30 PM" — exact format may differ
    # by platform locale; assert key tokens.
    assert "May" in s
    assert "24" in s
    assert "30" in s


def _fake_patient(name: str = "Sarah Walters"):
    return SimpleNamespace(name=name)


def _fake_visit(complaint: str = "Productive cough × 4 days"):
    return SimpleNamespace(
        visit_date=date(2026, 5, 10),
        chief_complaint=complaint,
        prescriptions=[
            SimpleNamespace(drug_name="Ambroxol", dose="30 mg", duration_days=5)
        ],
    )


def _fake_reminder(reason: str = "Cough follow-up"):
    return SimpleNamespace(
        appointment_at=datetime.now(timezone.utc) + timedelta(days=7),
        reason=reason,
        channel="sms",
    )


def test_build_user_prompt_includes_first_name_and_reason():
    patient = _fake_patient("Sarah Walters")
    prompt = build_user_prompt(_fake_reminder("BP recheck"), patient, None)
    assert "Sarah" in prompt
    assert "BP recheck" in prompt


def test_build_user_prompt_includes_previous_visit_when_provided():
    patient = _fake_patient()
    visit = _fake_visit()
    prompt = build_user_prompt(_fake_reminder(), patient, visit)
    assert "Ambroxol" in prompt
    assert "2026-05-10" in prompt
    assert "Productive cough" in prompt


def test_build_user_prompt_omits_visit_block_when_no_history():
    patient = _fake_patient()
    prompt = build_user_prompt(_fake_reminder(), patient, None)
    assert "Previous visit context" not in prompt


def test_build_user_prompt_ends_with_writing_instruction():
    prompt = build_user_prompt(_fake_reminder(), _fake_patient(), None)
    assert "Write the reminder" in prompt
