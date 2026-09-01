"""Clinic-floor KPIs for the physician dashboard.

A read-only snapshot computed on every poll. Everything is scoped to "today"
in UTC, since the seed and the queue already operate in UTC. Counts are
returned per-status and per-flag so the frontend can render a strip without
extra logic.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intake import IntakeSession, IntakeStatus
from app.models.note import ConsultationNote, NoteStatus
from app.models.queue_ticket import QueueTicket, TicketStatus
from app.models.reminder import AppointmentReminder, ReminderStatus
from app.models.transcript import ConsultationTranscript, TranscriptStatus
from app.models.visit import Poli


def _today_start() -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=24)


async def compute_stats(db: AsyncSession) -> dict[str, Any]:
    cutoff = _today_start()

    # Tickets by status (active across all departments, last 24h)
    tickets_stmt = (
        select(QueueTicket.status, func.count())
        .where(QueueTicket.issued_at >= cutoff)
        .group_by(QueueTicket.status)
    )
    status_rows = (await db.execute(tickets_stmt)).all()
    by_status: dict[str, int] = {s.value: 0 for s in TicketStatus}
    for status, count in status_rows:
        by_status[status.value] = count

    # Per-department waiting head count (waiting + in_intake + intake_complete)
    poli_active_stmt = (
        select(QueueTicket.poli, func.count())
        .where(
            and_(
                QueueTicket.issued_at >= cutoff,
                QueueTicket.status.in_(
                    [
                        TicketStatus.waiting,
                        TicketStatus.in_intake,
                        TicketStatus.intake_complete,
                    ]
                ),
            )
        )
        .group_by(QueueTicket.poli)
    )
    per_poli: dict[str, int] = {p.value: 0 for p in Poli}
    for poli, count in (await db.execute(poli_active_stmt)).all():
        per_poli[poli.value] = count

    # Intakes completed today
    intakes_stmt = select(func.count()).where(
        and_(
            IntakeSession.status == IntakeStatus.completed,
            IntakeSession.completed_at >= cutoff,
        )
    )
    intakes_completed = (await db.execute(intakes_stmt)).scalar_one() or 0

    # Triage flags fired today — sum across active intake sessions started today
    flag_stmt = select(IntakeSession.triage_flags).where(
        IntakeSession.started_at >= cutoff
    )
    flag_rows = (await db.execute(flag_stmt)).scalars().all()
    flag_counts: dict[str, int] = {}
    for flags in flag_rows:
        for f in (flags or []):
            flag_counts[f] = flag_counts.get(f, 0) + 1
    total_flags = sum(flag_counts.values())

    # Average consultation duration today (minutes), called → completed
    duration_stmt = select(
        func.avg(
            func.extract("epoch", QueueTicket.completed_at - QueueTicket.called_at)
            / 60.0
        )
    ).where(
        and_(
            QueueTicket.status == TicketStatus.done,
            QueueTicket.completed_at >= cutoff,
            QueueTicket.called_at.isnot(None),
            QueueTicket.completed_at.isnot(None),
        )
    )
    avg_consult = (await db.execute(duration_stmt)).scalar_one()
    avg_consult_min = float(avg_consult) if avg_consult is not None else None

    # Median wait — issued → called, minutes (use AVG as approximation if no
    # percentile_cont available)
    wait_stmt = select(
        func.avg(
            func.extract("epoch", QueueTicket.called_at - QueueTicket.issued_at)
            / 60.0
        )
    ).where(
        and_(
            QueueTicket.called_at.isnot(None),
            QueueTicket.called_at >= cutoff,
        )
    )
    avg_wait = (await db.execute(wait_stmt)).scalar_one()
    avg_wait_min = float(avg_wait) if avg_wait is not None else None

    # Reminders sent today
    reminders_stmt = select(func.count()).where(
        and_(
            AppointmentReminder.status == ReminderStatus.sent,
            AppointmentReminder.sent_at >= cutoff,
        )
    )
    reminders_sent = (await db.execute(reminders_stmt)).scalar_one() or 0

    reminders_pending_stmt = select(func.count()).where(
        AppointmentReminder.status == ReminderStatus.pending
    )
    reminders_pending = (await db.execute(reminders_pending_stmt)).scalar_one() or 0

    # Transcripts done today
    transcripts_stmt = select(func.count()).where(
        and_(
            ConsultationTranscript.status == TranscriptStatus.done,
            ConsultationTranscript.created_at >= cutoff,
        )
    )
    transcripts_done = (await db.execute(transcripts_stmt)).scalar_one() or 0

    # SOAP notes done today
    notes_stmt = select(func.count()).where(
        and_(
            ConsultationNote.status == NoteStatus.done,
            ConsultationNote.completed_at >= cutoff,
        )
    )
    notes_done = (await db.execute(notes_stmt)).scalar_one() or 0

    waiting_total = (
        by_status.get(TicketStatus.waiting.value, 0)
        + by_status.get(TicketStatus.in_intake.value, 0)
        + by_status.get(TicketStatus.intake_complete.value, 0)
    )
    consulting = by_status.get(TicketStatus.in_consultation.value, 0)
    seen_today = by_status.get(TicketStatus.done.value, 0)

    return {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "tickets": {
            "waiting": waiting_total,
            "in_consultation": consulting,
            "seen_today": seen_today,
            "by_status": by_status,
            "by_poli_active": per_poli,
        },
        "intakes_completed_today": intakes_completed,
        "triage": {
            "total_today": total_flags,
            "by_flag": flag_counts,
        },
        "avg_consult_minutes": avg_consult_min,
        "avg_wait_minutes": avg_wait_min,
        "reminders": {
            "sent_today": reminders_sent,
            "pending": reminders_pending,
        },
        "transcripts_today": transcripts_done,
        "notes_today": notes_done,
    }
