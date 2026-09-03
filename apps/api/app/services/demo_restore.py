"""Keep the demo clinic alive across a judging window.

The deployed clinic is a single shared dataset, and judging runs for weeks. Each
visitor who works through the flow calls patients in, signs prescriptions and
closes visits — so the floor drains, and the judge who arrives fifth finds an
empty waiting room and no way to see the product work.

Rather than ask anyone to reseed by hand, restore the clinic once it is
genuinely idle: no active tickets, and nothing touched for a while. Both
conditions matter. "No active tickets" alone would wipe the board the instant
someone closed their last consultation, taking the stats they were about to look
at with it; the quiet period lets them finish reading.

There is a third case, and leaving it out cost a day of judging. A visitor who
calls a patient in and then closes the tab strands that ticket in consultation.
The floor is then never empty again, so the drained-and-idle rule stops firing
for good and the clinic quietly freezes with patients mid-visit. A floor nobody
has touched for much longer than the idle window is abandoned rather than busy,
and gets restored with those tickets still on it.

Off unless DEMO_AUTO_RESTORE is set, so a real deployment never silently
truncates its own tables.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models.queue_ticket import QueueTicket, TicketStatus

logger = logging.getLogger(__name__)

_ACTIVE = (
    TicketStatus.waiting,
    TicketStatus.in_intake,
    TicketStatus.intake_complete,
    TicketStatus.in_consultation,
)


async def restore_if_idle() -> bool:
    """Reseed the demo clinic if nobody is using it. Returns True if it ran."""
    settings = get_settings()
    if not settings.DEMO_AUTO_RESTORE:
        return False

    async with SessionLocal() as db:
        active = await db.scalar(
            select(func.count())
            .select_from(QueueTicket)
            .where(QueueTicket.status.in_(_ACTIVE))
        )
        # An empty board on a fresh database is not "drained", it is "never
        # seeded" — restore that too, otherwise the first visitor finds nothing.
        # called_at matters as much as the other two: a ticket sitting in
        # consultation was last touched when it was called in, not when it was
        # issued.
        last_touch = await db.scalar(
            select(func.max(func.greatest(
                QueueTicket.issued_at,
                func.coalesce(QueueTicket.called_at, QueueTicket.issued_at),
                func.coalesce(QueueTicket.completed_at, QueueTicket.issued_at),
            )))
        )

    idle_for = None
    if last_touch is not None:
        if last_touch.tzinfo is None:
            last_touch = last_touch.replace(tzinfo=timezone.utc)
        idle_for = datetime.now(timezone.utc) - last_touch

    if active:
        # Requiring an empty board was not enough. Anyone who calls a patient in
        # and then closes the tab leaves a ticket in consultation forever, and
        # the floor never drains again for the rest of the judging window — the
        # clinic silently stops restoring and nobody finds out until a judge
        # arrives to four stranded patients. A floor nobody has touched in a
        # long time is abandoned, not busy.
        if idle_for is None or idle_for < timedelta(
            minutes=settings.DEMO_RESTORE_STALE_MINUTES
        ):
            return False
        logger.info("demo clinic abandoned mid-visit for %s, restoring", idle_for)
    elif idle_for is not None:
        if idle_for < timedelta(minutes=settings.DEMO_RESTORE_IDLE_MINUTES):
            return False
        logger.info("demo clinic idle for %s, restoring", idle_for)
    else:
        logger.info("demo clinic is empty, seeding for the first time")

    # Deliberately NOT seed.main(): that helper ends with engine.dispose(), which
    # would tear down the running application's connection pool. Drive the same
    # reset-and-seed steps against our own session instead.
    from seed.demo_scenarios import _reset, _seed

    async with SessionLocal() as db:
        await _reset(db)
        await _seed(db)

    logger.info("demo clinic restored")
    return True
