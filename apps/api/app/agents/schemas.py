"""Structured-output schema definitions for each agent.

Patiently uses three agents in a pipeline:
  - Intake Agent: conversational; no triage responsibility.
  - Triage Agent: stateless per-turn red-flag classifier (runs in parallel).
  - Summarizer Agent: chart writer; runs once after the intake completes.
"""

INTAKE_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "reply_text": {"type": "string"},
        "extracted_fields": {
            "type": "object",
            "properties": {
                "chief_complaint": {"type": "string", "nullable": True},
                "onset": {"type": "string", "nullable": True},
                "location": {"type": "string", "nullable": True},
                "character": {"type": "string", "nullable": True},
                "severity": {"type": "integer", "nullable": True},
                "duration": {"type": "string", "nullable": True},
                "associated_symptoms": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "aggravating": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "relieving": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "medications_taken_today": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "followup_status": {"type": "string", "nullable": True},
                "followup_adherence": {"type": "string", "nullable": True},
                "followup_side_effects": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
        },
        "is_complete": {"type": "boolean"},
    },
    "required": ["reply_text", "is_complete"],
}


TRIAGE_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "triage_flags": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [
                    "CHEST_PAIN_CARDIAC",
                    "STROKE_SYMPTOMS",
                    "RESPIRATORY_DISTRESS",
                    "OBSTETRIC_BLEEDING",
                    "PEDS_RED_FLAG",
                    "SEVERE_DEHYDRATION",
                    "ANAPHYLAXIS_SUSPECT",
                    "SUICIDAL_IDEATION",
                ],
            },
        },
        "reasoning": {"type": "string"},
    },
    "required": ["triage_flags"],
}


SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "chief_complaint": {"type": "string"},
        "hpi_paragraph": {"type": "string"},
        "relevant_history": {
            "type": "array",
            "items": {"type": "string"},
        },
        "triage_assessment": {"type": "string"},
        "followup_delta": {
            "type": "object",
            "nullable": True,
            "properties": {
                "previous_treatment": {"type": "string"},
                "adherence": {"type": "string"},
                "symptom_response": {"type": "string"},
                "side_effects": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "clinical_interpretation": {"type": "string"},
            },
        },
        "suggested_questions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "differentials": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": [
        "chief_complaint",
        "hpi_paragraph",
        "triage_assessment",
    ],
}
