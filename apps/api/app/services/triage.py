"""Triage priority mapping.

Higher number = served sooner.

Obstetric bleeding and suicidal ideation used to sit at 50, behind severe
dehydration at 100. That ordering is hard to defend: bleeding in pregnancy can
be abruption or previa, and someone who has just disclosed suicidal ideation
should not be left sitting in a waiting room behind a queue. Every code in this
table is a red flag by construction — a two-tier split needs a clinical
rationale, and there was none written down for those two.

They are all 100 now. This is a judgement call made by an engineer, not a
clinician, and a real deployment should have it reviewed; the structure supports
tiering if a clinician wants it back.
"""
RED_FLAG_PRIORITY = {
    "CHEST_PAIN_CARDIAC": 100,
    "STROKE_SYMPTOMS": 100,
    "RESPIRATORY_DISTRESS": 100,
    "ANAPHYLAXIS_SUSPECT": 100,
    "PEDS_RED_FLAG": 100,
    "SEVERE_DEHYDRATION": 100,
    "OBSTETRIC_BLEEDING": 100,
    "SUICIDAL_IDEATION": 100,
}

RED_FLAG_LABEL = {
    "CHEST_PAIN_CARDIAC": "Possible acute coronary syndrome",
    "STROKE_SYMPTOMS": "Acute neurological symptoms (possible stroke)",
    "RESPIRATORY_DISTRESS": "Respiratory distress",
    "ANAPHYLAXIS_SUSPECT": "Suspected anaphylaxis",
    "PEDS_RED_FLAG": "Pediatric red flag",
    "SEVERE_DEHYDRATION": "Severe dehydration",
    "OBSTETRIC_BLEEDING": "Obstetric bleeding",
    "SUICIDAL_IDEATION": "Suicidal ideation",
}


def max_priority_for(flags: list[str]) -> int:
    return max((RED_FLAG_PRIORITY.get(f, 0) for f in flags), default=0)


def flag_label(flag: str) -> str:
    return RED_FLAG_LABEL.get(flag, flag)
