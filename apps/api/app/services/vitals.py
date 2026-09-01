"""Vital-signs service.

Persists triage-nurse measurements and detects critical findings using
standard adult outpatient thresholds. The findings list is used by both
the dashboard (visual warning) and the SOAP note drafter (input to
Featherless).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.queue_ticket import QueueTicket
from app.models.vital_signs import VitalSigns


# Codes are short strings used as keys; labels are rendered to clinicians.
CRITICAL_LABELS: dict[str, str] = {
    "HYPERTENSIVE_CRISIS": "Hypertensive crisis (SBP ≥180 or DBP ≥120)",
    "HYPOTENSION": "Hypotension (SBP <90)",
    "SEVERE_TACHYCARDIA": "Severe tachycardia (HR ≥130)",
    "BRADYCARDIA": "Bradycardia (HR <50)",
    "HYPOXIA": "Hypoxia (SpO₂ <92%)",
    "TACHYPNEA": "Tachypnea (RR ≥24)",
    "HIGH_FEVER": "High fever (T ≥39.0 °C)",
    "HYPOTHERMIA": "Hypothermia (T <35.0 °C)",
    "SEVERE_PAIN": "Severe pain (≥8/10)",
}


def detect_critical(v: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    sbp = v.get("systolic_bp")
    dbp = v.get("diastolic_bp")
    hr = v.get("heart_rate")
    rr = v.get("respiratory_rate")
    temp = v.get("temperature_c")
    spo2 = v.get("spo2")
    pain = v.get("pain_score")

    if sbp is not None and sbp >= 180:
        flags.append("HYPERTENSIVE_CRISIS")
    elif dbp is not None and dbp >= 120:
        flags.append("HYPERTENSIVE_CRISIS")
    if sbp is not None and sbp < 90:
        flags.append("HYPOTENSION")

    if hr is not None and hr >= 130:
        flags.append("SEVERE_TACHYCARDIA")
    if hr is not None and hr < 50:
        flags.append("BRADYCARDIA")

    if spo2 is not None and spo2 < 92:
        flags.append("HYPOXIA")

    if rr is not None and rr >= 24:
        flags.append("TACHYPNEA")

    if temp is not None and temp >= 39.0:
        flags.append("HIGH_FEVER")
    if temp is not None and temp < 35.0:
        flags.append("HYPOTHERMIA")

    if pain is not None and pain >= 8:
        flags.append("SEVERE_PAIN")

    return flags


async def upsert_vitals(
    db: AsyncSession, ticket_id: uuid.UUID, payload: dict[str, Any]
) -> dict[str, Any]:
    ticket = await db.get(QueueTicket, ticket_id)
    if ticket is None:
        raise ValueError("ticket not found")

    stmt = select(VitalSigns).where(VitalSigns.ticket_id == ticket_id)
    row = (await db.execute(stmt)).scalar_one_or_none()

    fields = {
        "systolic_bp",
        "diastolic_bp",
        "heart_rate",
        "respiratory_rate",
        "temperature_c",
        "spo2",
        "weight_kg",
        "height_cm",
        "pain_score",
        "recorded_by",
    }
    incoming = {k: payload.get(k) for k in fields if k in payload}
    critical = detect_critical({k: payload.get(k) for k in fields})

    if row is None:
        row = VitalSigns(
            ticket_id=ticket_id,
            **{k: v for k, v in incoming.items()},
            critical_findings=critical,
        )
        db.add(row)
    else:
        for k, v in incoming.items():
            setattr(row, k, v)
        row.critical_findings = critical
        row.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(row)
    return _serialize(row)


async def get_vitals(
    db: AsyncSession, ticket_id: uuid.UUID
) -> dict[str, Any] | None:
    stmt = select(VitalSigns).where(VitalSigns.ticket_id == ticket_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    return _serialize(row) if row else None


def _serialize(v: VitalSigns) -> dict[str, Any]:
    return {
        "id": str(v.id),
        "ticket_id": str(v.ticket_id),
        "systolic_bp": v.systolic_bp,
        "diastolic_bp": v.diastolic_bp,
        "heart_rate": v.heart_rate,
        "respiratory_rate": v.respiratory_rate,
        "temperature_c": v.temperature_c,
        "spo2": v.spo2,
        "weight_kg": v.weight_kg,
        "height_cm": v.height_cm,
        "pain_score": v.pain_score,
        "recorded_by": v.recorded_by,
        "critical_findings": list(v.critical_findings or []),
        "critical_labels": [
            CRITICAL_LABELS.get(f, f) for f in (v.critical_findings or [])
        ],
        "recorded_at": v.recorded_at.isoformat() if v.recorded_at else None,
        "updated_at": v.updated_at.isoformat() if v.updated_at else None,
    }
