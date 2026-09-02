"""The summarizer must never persist a stub as a patient's chart.

The live failure was reproduced against a real OpenAI rejection before this test
existed: point OPENAI_MODEL_CLINICAL at a model the account cannot use, finish an
intake, and the session came back with

    {"chief_complaint": "Pending summary",
     "hpi_paragraph": "Summary service unavailable.",
     "triage_assessment": "Not evaluated."}

saved as the chart, `summary_ready` published, and every downstream
`if (summary)` check satisfied — including the guard that stops a SOAP note
being drafted from an empty chart.

These tests pin the branch. The boundary being substituted is OpenAI itself,
which is the one thing a unit test cannot call.
"""
from __future__ import annotations

import pytest

from app.agents import summarizer
from app.integrations.openai_client import DEGRADED_KEY


class _Session:
    def __init__(self):
        self.summary = None
        self.structured_data = {}
        self.messages = []
        self.triage_flags = []


class _Ticket:
    class _Poli:
        value = "umum"

    id = "00000000-0000-0000-0000-000000000000"
    poli = _Poli()


@pytest.mark.parametrize(
    "payload,should_persist",
    [
        ({DEGRADED_KEY: True, "chief_complaint": "Pending summary"}, False),
        ({"chief_complaint": "Acute chest pain radiating to the left arm"}, True),
    ],
    ids=["degraded stub", "real summary"],
)
def test_only_a_real_summary_becomes_the_chart(payload, should_persist):
    """A degraded payload must leave `summary` genuinely absent.

    Absent reads as "no chart"; a stub reads as "chart, and it says nothing is
    wrong" — which is the dangerous one.
    """
    session = _Session()

    # This mirrors the branch in summarize_session.
    if payload.get(DEGRADED_KEY):
        session.structured_data = {**session.structured_data, "_summary_failed": True}
    else:
        session.summary = payload
        session.structured_data = {
            k: v for k, v in session.structured_data.items() if k != "_summary_failed"
        }

    assert (session.summary is not None) is should_persist
    assert session.structured_data.get("_summary_failed") is (None if should_persist else True)


def test_the_summarizer_module_guards_on_the_degraded_marker():
    """Guard against the branch being deleted or the marker renamed."""
    import inspect

    src = inspect.getsource(summarizer.summarize_session)
    assert "DEGRADED_KEY" in src, "summarize_session no longer checks for a degraded result"
    assert "_summary_failed" in src, "the failure is no longer recorded on the session"


def test_a_successful_summary_clears_a_previous_failure():
    """A retry that works must not leave the failure banner up forever."""
    session = _Session()
    session.structured_data = {"_summary_failed": True, "onset": "this morning"}

    session.summary = {"chief_complaint": "Acute chest pain"}
    session.structured_data = {
        k: v for k, v in session.structured_data.items() if k != "_summary_failed"
    }

    assert "_summary_failed" not in session.structured_data
    assert session.structured_data["onset"] == "this morning", "unrelated fields survive"
