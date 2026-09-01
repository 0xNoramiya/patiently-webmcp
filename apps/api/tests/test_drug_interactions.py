"""Drug-interaction matcher is a clinical safety primitive. If we silently
miss a major interaction (e.g. NSAID + warfarin) or false-positive a benign
pair, the doctor either ignores the panel or signs a dangerous Rx.

Pure-function tests against the curated rule set."""
from __future__ import annotations

import pytest

from app.services.drug_interactions import (
    categories_for,
    find_interactions,
    normalise,
    serialize,
)


def test_normalise_strips_case_and_punct():
    assert normalise("Mefenamic Acid") == "mefenamicacid"
    assert normalise("AMOXICILLIN") == "amoxicillin"
    assert normalise("  Ibu-profen ") == "ibuprofen"
    assert normalise("") == ""


def test_categories_include_self_tag_and_class():
    cats = categories_for("Ibuprofen")
    assert "nsaid" in cats
    assert "ibuprofen" in cats


def test_unknown_drug_still_gets_self_tag():
    cats = categories_for("WeirdMed-9000")
    assert "weirdmed" in cats


def test_no_interaction_among_safe_pair():
    assert find_interactions(["Paracetamol", "Ambroxol"]) == []


def test_nsaid_plus_acei_is_major():
    inter = find_interactions(["Ibuprofen", "Lisinopril"])
    assert len(inter) == 1
    assert inter[0].severity == "major"
    assert "kidney" in inter[0].rationale.lower()


def test_nsaid_plus_arb_also_fires():
    inter = find_interactions(["Naproxen", "Losartan"])
    assert any(i.severity == "major" for i in inter)


def test_warfarin_plus_aspirin_major():
    inter = find_interactions(["Warfarin", "Aspirin"])
    assert any(i.severity == "major" and "bleed" in i.rationale.lower() for i in inter)


def test_warfarin_plus_antibiotic_moderate():
    inter = find_interactions(["Warfarin", "Amoxicillin"])
    assert any(i.severity == "moderate" and "inr" in i.rationale.lower() for i in inter)


def test_amlodipine_plus_simvastatin_moderate():
    inter = find_interactions(["Amlodipine", "Simvastatin"])
    assert len(inter) >= 1
    assert any("myopathy" in i.rationale.lower() for i in inter)


def test_beta_blocker_plus_non_dhp_ccb_major():
    inter = find_interactions(["Metoprolol", "Verapamil"])
    assert any(i.severity == "major" and "bradycard" in i.rationale.lower() for i in inter)


def test_ssri_plus_tramadol_serotonin_syndrome():
    inter = find_interactions(["Sertraline", "Tramadol"])
    assert any(i.severity == "major" and "serotonin" in i.rationale.lower() for i in inter)


def test_opioid_plus_benzo_boxed_warning():
    inter = find_interactions(["Codeine", "Alprazolam"])
    assert any(
        i.severity == "major" and "respiratory" in i.rationale.lower() for i in inter
    )


def test_pde5_plus_nitrate_contraindication():
    inter = find_interactions(["Sildenafil", "Nitroglycerin"])
    assert any(i.severity == "major" and "hypotension" in i.rationale.lower() for i in inter)


def test_two_qt_prolongers_moderate():
    inter = find_interactions(["Clarithromycin", "Ciprofloxacin"])
    # both prolong QT; clarithromycin is also a CYP3A4 inhibitor, which
    # may double-fire. The QT rule must at least be present.
    assert any("qt" in i.rationale.lower() for i in inter)


def test_duplicate_names_are_deduped():
    inter = find_interactions(["Ibuprofen", "Ibuprofen", "Lisinopril"])
    nsaid_ace = [
        i for i in inter
        if {i.drug_a.lower(), i.drug_b.lower()} == {"ibuprofen", "lisinopril"}
    ]
    assert len(nsaid_ace) == 1


def test_unknown_drugs_dont_throw_or_match():
    inter = find_interactions(["Foo", "Bar", "Baz"])
    assert inter == []


def test_three_drug_pool_finds_all_pairs():
    inter = find_interactions(["Aspirin", "Warfarin", "Ibuprofen"])
    pairs = {tuple(sorted([i.drug_a.lower(), i.drug_b.lower()])) for i in inter}
    assert ("aspirin", "warfarin") in pairs
    assert ("ibuprofen", "warfarin") in pairs


def test_sorted_major_before_moderate():
    inter = find_interactions(["Warfarin", "Amoxicillin", "Ibuprofen"])
    severities = [i.severity for i in inter]
    rank = {"major": 0, "moderate": 1, "minor": 2}
    assert severities == sorted(severities, key=lambda s: rank.get(s, 9))


def test_serialize_shape():
    inter = find_interactions(["Ibuprofen", "Lisinopril"])
    out = serialize(inter)
    assert out and set(out[0].keys()) == {"drug_a", "drug_b", "severity", "rationale"}


@pytest.mark.parametrize(
    "drugs,expected_severity",
    [
        (["Ibuprofen", "Apixaban"], "major"),   # NSAID + DOAC
        (["Allopurinol", "Azathioprine"], "major"),  # myelosuppression
        (["Sildenafil", "Isosorbide Mononitrate"], "major"),
        (["Lisinopril", "Spironolactone"], "moderate"),  # hyperkalemia
    ],
)
def test_high_yield_pairs(drugs, expected_severity):
    inter = find_interactions(drugs)
    assert any(i.severity == expected_severity for i in inter), (
        f"expected at least one {expected_severity} interaction in {drugs}"
    )
