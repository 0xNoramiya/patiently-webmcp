"""What the interaction checker must catch, and must not.

The README calls this a safety net that "cross-checks every drug in play", so it
is worth pinning what that actually covers. Two things were found by testing it
against known-dangerous pairs rather than trusting the rule table by eye:

  * ACE inhibitor + ARB never fired. Both appear inside `frozenset({"acei",
    "arb"})` on one side of other rules, which reads as covered — but that
    means "either one", and nothing matched the two of them together.
  * Warfarin + aspirin reported twice, once for the antiplatelet mechanism and
    once for the NSAID one. Two real reasons, presented as a duplicate row.
"""
from __future__ import annotations

import pytest

from app.services.drug_interactions import find_interactions


@pytest.mark.parametrize(
    "label,drugs",
    [
        ("anticoagulant + antiplatelet", ["Warfarin", "Aspirin"]),
        ("anticoagulant + NSAID", ["Warfarin", "Ibuprofen"]),
        ("nitrate + PDE5 inhibitor", ["Nitroglycerin", "Sildenafil"]),
        ("dual RAAS blockade", ["Lisinopril", "Losartan"]),
        ("RAAS + potassium-sparing diuretic", ["Lisinopril", "Spironolactone"]),
        ("macrolide + statin", ["Clarithromycin", "Simvastatin"]),
        ("SSRI + tramadol", ["Sertraline", "Tramadol"]),
    ],
)
def test_dangerous_combinations_are_caught(label, drugs):
    found = find_interactions(drugs)
    assert found, f"{label} went undetected"


@pytest.mark.parametrize(
    "drugs",
    [
        ["Aspirin", "Paracetamol"],
        ["Amoxicillin", "Paracetamol"],
        ["Metformin", "Paracetamol"],
        ["Ambroxol", "Paracetamol"],
    ],
)
def test_benign_combinations_stay_quiet(drugs):
    """False positives train clinicians to ignore the panel, which is how a real
    warning gets missed."""
    assert find_interactions(drugs) == []


def test_the_nitrate_pde5_rule_matters_for_this_demo():
    """The demo prescribes nitroglycerin for chest pain, and the SOAP plan
    explicitly asks about recent PDE5 use — so the checker has to know it."""
    found = find_interactions(["Nitroglycerin", "Sildenafil"])
    assert found[0].severity == "major"
    assert "hypotension" in found[0].rationale.lower()


def test_one_row_per_drug_pair_even_when_several_rules_match():
    """Warfarin + aspirin matches on antiplatelet AND NSAID grounds. Both reasons
    belong in the report; two identical-looking rows do not."""
    found = find_interactions(["Warfarin", "Aspirin"])
    assert len(found) == 1
    assert found[0].severity == "major"
    # Both mechanisms survive the merge.
    text = found[0].rationale.lower()
    assert "nsaid" in text and "antiplatelet" in text


def test_the_worst_severity_wins_a_merge():
    found = find_interactions(["Warfarin", "Aspirin"])
    assert found[0].severity == "major"


def test_results_are_ordered_worst_first():
    found = find_interactions(
        ["Warfarin", "Aspirin", "Lisinopril", "Spironolactone"]
    )
    ranks = {"major": 0, "moderate": 1, "minor": 2}
    assert [ranks[i.severity] for i in found] == sorted(ranks[i.severity] for i in found)


def test_a_single_drug_interacts_with_nothing():
    assert find_interactions(["Aspirin"]) == []
    assert find_interactions([]) == []


def test_duplicate_names_do_not_self_interact():
    """The same drug listed twice — a draft plus a home med — is not a pair."""
    assert find_interactions(["Aspirin", "aspirin", "ASPIRIN"]) == []
