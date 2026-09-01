"""Reminder service — fires due reminders, persists generated messages."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.reminder import generate_message
from app.agents.context import previous_visit_for_visit
from app.core.db import SessionLocal
from app.models.patient import Patient
from app.models.reminder import AppointmentReminder, ReminderStatus
from app.models.visit import Visit
from app.services.events import bus

logger = logging.getLogger(__name__)


async def fire_due_reminders() -> int:
    """Process every reminder whose scheduled_for has passed."""
    now = datetime.now(timezone.utc)
    fired = 0
    async with SessionLocal() as db:
        stmt = (
            select(AppointmentReminder)
            .where(
                and_(
                    AppointmentReminder.status == ReminderStatus.pending,
                    AppointmentReminder.scheduled_for <= now,
                )
            )
            .options(
                selectinload(AppointmentReminder.patient),
                selectinload(AppointmentReminder.visit).selectinload(
                    Visit.prescriptions
                ),
            )
            .order_by(AppointmentReminder.scheduled_for)
        )
        rows = (await db.execute(stmt)).scalars().all()
        for r in rows:
            try:
                await _fire_one(db, r)
                fired += 1
            except Exception as e:  # noqa: BLE001
                logger.exception("reminder %s failed: %s", r.id, e)
                r.status = ReminderStatus.error
                r.error = str(e)[:500]
                await db.commit()
    return fired


async def fire_reminder(reminder_id: uuid.UUID) -> AppointmentReminder:
    """Force-fire a single reminder (admin trigger)."""
    async with SessionLocal() as db:
        r = await _load(db, reminder_id)
        if r is None:
            raise ValueError("reminder not found")
        await _fire_one(db, r)
        return r


async def _load(
    db: AsyncSession, reminder_id: uuid.UUID
) -> AppointmentReminder | None:
    stmt = (
        select(AppointmentReminder)
        .where(AppointmentReminder.id == reminder_id)
        .options(
            selectinload(AppointmentReminder.patient),
            selectinload(AppointmentReminder.visit).selectinload(
                Visit.prescriptions
            ),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _fire_one(db: AsyncSession, r: AppointmentReminder) -> None:
    logger.info(
        "firing reminder %s for patient %s (%s)",
        r.id,
        r.patient.name if r.patient else r.patient_id,
        r.reason,
    )
    out = await generate_message(r, r.patient, r.visit)
    now = datetime.now(timezone.utc)
    r.message = out["message"]
    r.model_used = out["model_used"]
    r.generated_at = now
    r.sent_at = now
    r.status = ReminderStatus.sent
    r.error = None
    await db.commit()
    await bus.publish(
        "dashboard",
        "reminder_sent",
        {
            "reminder_id": str(r.id),
            "patient_id": str(r.patient_id),
            "patient_name": r.patient.name if r.patient else "",
            "reason": r.reason,
        },
    )
