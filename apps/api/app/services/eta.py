"""ETA computation per poli.

Strategy: rolling average of last 20 completed consultations today for that
poli (called_at -> completed_at delta). If <5 samples, use prior.
"""
from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.queue_ticket import QueueTicket, TicketStatus
from app.models.visit import Poli

PRIOR_MINUTES = {
    Poli.umum: 8.0,
    Poli.anak: 12.0,
    Poli.kia: 15.0,
    Poli.gigi: 20.0,
    Poli.lansia: 10.0,
}


async def avg_consultation_minutes(db: AsyncSession, poli: Poli) -> float:
    """Rolling avg of last ~20 completed consultations within last 24h (UTC)."""
    cutoff = datetime.now(timezone.utc).replace(microsecond=0)
    # Look back 24h to capture "today's" sample regardless of TZ rollover.
    from datetime import timedelta
    cutoff -= timedelta(hours=24)
    stmt = (
        select(QueueTicket)
        .where(
            and_(
                QueueTicket.poli == poli,
                QueueTicket.status == TicketStatus.done,
                QueueTicket.called_at.isnot(None),
                QueueTicket.completed_at.isnot(None),
                QueueTicket.completed_at >= cutoff,
            )
        )
        .order_by(QueueTicket.completed_at.desc())
        .limit(20)
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()
    samples = [
        (t.completed_at - t.called_at).total_seconds() / 60.0
        for t in rows
        if t.completed_at and t.called_at
    ]
    if len(samples) < 5:
        return PRIOR_MINUTES[poli]
    return sum(samples) / len(samples)


def eta_range(people_ahead: int, avg_minutes: float) -> tuple[int, int]:
    """Return (low, high) minutes until this patient is called.

    `people_ahead` is how many consultations must finish first — the patients
    queued ahead of them, plus anyone currently in a consulting room.

    This used to take the 1-indexed queue position, which quoted every patient
    one extra consultation: the person at the front of an idle clinic was told
    six to ten minutes when the doctor was free and they were about to be
    called. Position 1 with nobody in a room means nobody is ahead of you.
    """
    base = max(0, people_ahead) * avg_minutes
    low = max(0, int(round(base * 0.8)))
    high = max(low + 1, int(round(base * 1.2)))
    return low, high
