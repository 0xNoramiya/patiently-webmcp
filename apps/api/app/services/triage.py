"""Triage priority mapping.

Higher number = served sooner. Critical flags get 100, urgent 50.
"""
RED_FLAG_PRIORITY = {
    "CHEST_PAIN_CARDIAC": 100,
    "STROKE_SYMPTOMS": 100,
    "RESPIRATORY_DISTRESS": 100,
    "ANAPHYLAXIS_SUSPECT": 100,
    "PEDS_RED_FLAG": 100,
    "SEVERE_DEHYDRATION": 100,
    "OBSTETRIC_BLEEDING": 50,
    "SUICIDAL_IDEATION": 50,
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
