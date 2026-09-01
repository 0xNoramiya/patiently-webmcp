"""Drug-drug interaction matcher.

A curated, deterministic rule set covering ~20 high-yield outpatient
interactions. We expand each input drug into the set of categories it
belongs to, then test every pair against the rules.

Out of scope (and intentionally so): full WHO/ICD interaction database,
dose-dependent thresholds, age-stratified rules. The clinic physician
remains the final arbiter — this is a safety-net not a substitute.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


# --- Drug → category mapping ---------------------------------------------
# Keys are normalised drug names (lowercase, no spaces/punct). Each maps
# to a frozenset of category tags. A drug also belongs to its own
# singleton category (its lowercase name) so name-vs-name rules work.

CATEGORIES: dict[str, frozenset[str]] = {
    # NSAIDs
    "ibuprofen": frozenset({"nsaid"}),
    "naproxen": frozenset({"nsaid"}),
    "diclofenac": frozenset({"nsaid"}),
    "mefenamicacid": frozenset({"nsaid"}),
    "celecoxib": frozenset({"nsaid"}),
    "ketorolac": frozenset({"nsaid"}),
    "aspirin": frozenset({"nsaid", "antiplatelet"}),
    # ACE inhibitors
    "enalapril": frozenset({"acei"}),
    "lisinopril": frozenset({"acei"}),
    "captopril": frozenset({"acei"}),
    "ramipril": frozenset({"acei"}),
    "perindopril": frozenset({"acei"}),
    # ARBs (share many interactions with ACEi)
    "losartan": frozenset({"arb"}),
    "valsartan": frozenset({"arb"}),
    # Diuretics
    "spironolactone": frozenset({"k_sparing_diuretic"}),
    "furosemide": frozenset({"loop_diuretic"}),
    "hydrochlorothiazide": frozenset({"thiazide"}),
    # Calcium channel blockers
    "amlodipine": frozenset({"dhp_ccb"}),
    "verapamil": frozenset({"non_dhp_ccb"}),
    "diltiazem": frozenset({"non_dhp_ccb"}),
    # Beta blockers
    "propranolol": frozenset({"beta_blocker"}),
    "atenolol": frozenset({"beta_blocker"}),
    "metoprolol": frozenset({"beta_blocker"}),
    "bisoprolol": frozenset({"beta_blocker"}),
    "carvedilol": frozenset({"beta_blocker"}),
    # Statins
    "simvastatin": frozenset({"statin", "cyp3a4_substrate"}),
    "atorvastatin": frozenset({"statin", "cyp3a4_substrate"}),
    "rosuvastatin": frozenset({"statin"}),
    "lovastatin": frozenset({"statin", "cyp3a4_substrate"}),
    "pravastatin": frozenset({"statin"}),
    # Anticoagulants / antiplatelets
    "warfarin": frozenset({"vka"}),
    "rivaroxaban": frozenset({"doac"}),
    "apixaban": frozenset({"doac"}),
    "clopidogrel": frozenset({"antiplatelet"}),
    # Antibiotics
    "amoxicillin": frozenset({"penicillin"}),
    "azithromycin": frozenset({"macrolide", "qt_prolong"}),
    "clarithromycin": frozenset({"macrolide", "cyp3a4_inhibitor", "qt_prolong"}),
    "erythromycin": frozenset({"macrolide", "cyp3a4_inhibitor", "qt_prolong"}),
    "ciprofloxacin": frozenset({"fluoroquinolone", "cyp1a2_inhibitor", "qt_prolong"}),
    "levofloxacin": frozenset({"fluoroquinolone", "qt_prolong"}),
    # Other antimicrobials
    "fluconazole": frozenset({"azole", "cyp3a4_inhibitor", "qt_prolong"}),
    # SSRIs / SNRIs
    "fluoxetine": frozenset({"ssri", "serotonergic"}),
    "sertraline": frozenset({"ssri", "serotonergic"}),
    "citalopram": frozenset({"ssri", "serotonergic", "qt_prolong"}),
    "escitalopram": frozenset({"ssri", "serotonergic", "qt_prolong"}),
    "paroxetine": frozenset({"ssri", "serotonergic"}),
    "venlafaxine": frozenset({"snri", "serotonergic"}),
    # Opioids
    "codeine": frozenset({"opioid"}),
    "tramadol": frozenset({"opioid", "serotonergic"}),
    "morphine": frozenset({"opioid"}),
    "oxycodone": frozenset({"opioid"}),
    # Benzos
    "diazepam": frozenset({"benzodiazepine", "cns_depressant"}),
    "lorazepam": frozenset({"benzodiazepine", "cns_depressant"}),
    "alprazolam": frozenset({"benzodiazepine", "cns_depressant"}),
    "midazolam": frozenset({"benzodiazepine", "cns_depressant", "cyp3a4_substrate"}),
    # Others
    "metformin": frozenset({"biguanide"}),
    "digoxin": frozenset({"narrow_ti"}),
    "amiodarone": frozenset({"antiarrhythmic", "cyp3a4_inhibitor", "qt_prolong"}),
    "lithium": frozenset({"narrow_ti"}),
    "methotrexate": frozenset({"narrow_ti"}),
    "theophylline": frozenset({"narrow_ti"}),
    "allopurinol": frozenset({"xanthine_oxidase_inh"}),
    "azathioprine": frozenset({"thiopurine"}),
    "sildenafil": frozenset({"pde5_inhibitor"}),
    "tadalafil": frozenset({"pde5_inhibitor"}),
    "nitroglycerin": frozenset({"nitrate"}),
    "isosorbidedinitrate": frozenset({"nitrate"}),
    "isosorbidemononitrate": frozenset({"nitrate"}),
    # Acid suppression
    "omeprazole": frozenset({"ppi"}),
    "esomeprazole": frozenset({"ppi"}),
    # Steroids
    "prednisone": frozenset({"corticosteroid"}),
    "prednisolone": frozenset({"corticosteroid"}),
    # Misc OTC
    "paracetamol": frozenset({"analgesic_otc"}),
    "ambroxol": frozenset({"mucolytic_otc"}),
}


# --- Rules ---------------------------------------------------------------

Severity = str  # "major" | "moderate" | "minor"


@dataclass(frozen=True)
class Rule:
    set_a: frozenset[str]
    set_b: frozenset[str]
    severity: Severity
    rationale: str


# A rule fires when one input drug matches anything in set_a and another
# matches anything in set_b (order-independent). Sets may contain either
# category tags (preferred) or specific drug keys.
RULES: tuple[Rule, ...] = (
    Rule(
        frozenset({"nsaid"}), frozenset({"acei", "arb"}),
        "major",
        "NSAID with ACE inhibitor/ARB can precipitate acute kidney injury, especially in volume-depleted or elderly patients.",
    ),
    Rule(
        frozenset({"nsaid"}), frozenset({"vka", "doac"}),
        "major",
        "Adding an NSAID to anticoagulation sharply raises GI and intracranial bleed risk.",
    ),
    Rule(
        frozenset({"nsaid"}), frozenset({"lithium"}),
        "major",
        "NSAIDs reduce lithium clearance and can drive toxicity.",
    ),
    Rule(
        frozenset({"nsaid"}), frozenset({"methotrexate"}),
        "major",
        "NSAID + methotrexate raises pancytopenia and nephrotoxicity risk.",
    ),
    Rule(
        frozenset({"aspirin"}), frozenset({"vka", "doac", "clopidogrel"}),
        "major",
        "Dual antiplatelet / antiplatelet + anticoagulant — bleeding risk; review indication.",
    ),
    Rule(
        frozenset({"warfarin"}), frozenset({"amoxicillin", "azithromycin", "clarithromycin", "ciprofloxacin", "levofloxacin", "fluconazole"}),
        "moderate",
        "Antibiotic-induced INR rise — recheck INR within 3–5 days.",
    ),
    Rule(
        frozenset({"acei", "arb"}), frozenset({"k_sparing_diuretic"}),
        "moderate",
        "Hyperkalemia risk when combining RAAS blockade with potassium-sparing diuretic.",
    ),
    Rule(
        frozenset({"beta_blocker"}), frozenset({"non_dhp_ccb"}),
        "major",
        "Combined AV-node suppression: risk of severe bradycardia, heart block, hypotension.",
    ),
    Rule(
        frozenset({"simvastatin"}), frozenset({"amlodipine"}),
        "moderate",
        "Amlodipine + simvastatin > 20 mg → myopathy risk; cap simvastatin at 20 mg.",
    ),
    Rule(
        frozenset({"cyp3a4_substrate"}), frozenset({"cyp3a4_inhibitor"}),
        "moderate",
        "CYP3A4 inhibitor will raise levels of co-administered CYP3A4 substrate — anticipate adverse effects.",
    ),
    Rule(
        frozenset({"serotonergic"}), frozenset({"serotonergic"}),
        "major",
        "Serotonin-syndrome risk when combining serotonergic agents (e.g. SSRI + tramadol).",
    ),
    Rule(
        frozenset({"opioid"}), frozenset({"benzodiazepine", "cns_depressant"}),
        "major",
        "Opioid + benzodiazepine — respiratory depression and sedation; FDA boxed-warning combination.",
    ),
    Rule(
        frozenset({"theophylline"}), frozenset({"ciprofloxacin", "fluvoxamine"}),
        "major",
        "CYP1A2 inhibition raises theophylline → seizures, arrhythmia.",
    ),
    Rule(
        frozenset({"digoxin"}), frozenset({"amiodarone", "verapamil", "clarithromycin", "erythromycin"}),
        "major",
        "Digoxin levels rise — toxicity (nausea, arrhythmia, visual changes).",
    ),
    Rule(
        frozenset({"allopurinol"}), frozenset({"azathioprine"}),
        "major",
        "Allopurinol blocks azathioprine metabolism — severe myelosuppression.",
    ),
    Rule(
        frozenset({"pde5_inhibitor"}), frozenset({"nitrate"}),
        "major",
        "PDE5 inhibitor + nitrate — profound hypotension; absolute contraindication within 24 h.",
    ),
    Rule(
        frozenset({"qt_prolong"}), frozenset({"qt_prolong"}),
        "moderate",
        "Stacked QT-prolonging agents — ECG before / during therapy if alternatives unavailable.",
    ),
    Rule(
        frozenset({"metformin"}), frozenset({"furosemide"}),
        "minor",
        "Loop diuretic can blunt metformin effect / raise lactic-acidosis risk in dehydration — counsel hydration.",
    ),
)


# --- API ------------------------------------------------------------------


@dataclass(frozen=True)
class Interaction:
    drug_a: str
    drug_b: str
    severity: Severity
    rationale: str


_NON_ALPHA = re.compile(r"[^a-z]+")


def normalise(name: str) -> str:
    """Lowercase, strip non-letters. So 'Mefenamic acid' → 'mefenamicacid'."""
    return _NON_ALPHA.sub("", (name or "").lower())


def categories_for(name: str) -> frozenset[str]:
    key = normalise(name)
    cats = CATEGORIES.get(key, frozenset())
    # Always include the singleton "name" tag for name-vs-name rules
    return cats | frozenset({key}) if key else cats


def _pair_matches(rule: Rule, cats_a: frozenset[str], cats_b: frozenset[str]) -> bool:
    return (
        bool(cats_a & rule.set_a) and bool(cats_b & rule.set_b)
    ) or (
        bool(cats_a & rule.set_b) and bool(cats_b & rule.set_a)
    )


def find_interactions(drug_names: list[str]) -> list[Interaction]:
    """Return all interactions found in `drug_names`. Order doesn't matter.

    Self-pairs are skipped. Duplicate (a,b) pairs collapse via a set of
    canonical keys, but two different rules on the same pair are kept.
    """
    cleaned = []
    seen_names: set[str] = set()
    for name in drug_names:
        norm = normalise(name)
        if not norm or norm in seen_names:
            continue
        seen_names.add(norm)
        cleaned.append((name.strip() or norm, norm, categories_for(name)))

    out: list[Interaction] = []
    seen_keys: set[tuple[str, str, str]] = set()
    for i in range(len(cleaned)):
        for j in range(i + 1, len(cleaned)):
            display_a, _, cats_a = cleaned[i]
            display_b, _, cats_b = cleaned[j]
            for rule in RULES:
                if _pair_matches(rule, cats_a, cats_b):
                    key = (
                        min(display_a, display_b).lower(),
                        max(display_a, display_b).lower(),
                        rule.rationale,
                    )
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    out.append(
                        Interaction(
                            drug_a=display_a,
                            drug_b=display_b,
                            severity=rule.severity,
                            rationale=rule.rationale,
                        )
                    )
    # Sort: major > moderate > minor, then alphabetical for stability
    rank = {"major": 0, "moderate": 1, "minor": 2}
    out.sort(key=lambda x: (rank.get(x.severity, 9), x.drug_a.lower(), x.drug_b.lower()))
    return out


def serialize(items: list[Interaction]) -> list[dict]:
    return [
        {
            "drug_a": i.drug_a,
            "drug_b": i.drug_b,
            "severity": i.severity,
            "rationale": i.rationale,
        }
        for i in items
    ]
