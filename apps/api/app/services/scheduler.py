"""APScheduler-based reminder firer.

Runs `fire_due_reminders` once per minute. Started in the FastAPI lifespan.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.services.demo_restore import restore_if_idle
from app.services.reminders import fire_due_reminders

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler
    sched = AsyncIOScheduler(timezone="UTC")
    sched.add_job(
        _safe_fire,
        trigger="interval",
        seconds=60,
        id="appointment_reminders_tick",
        max_instances=1,
        coalesce=True,
    )
    sched.start()
    _scheduler = sched
    logger.info("reminder scheduler started (60s interval)")
    return sched


async def _safe_fire() -> None:
    try:
        fired = await fire_due_reminders()
        if fired:
            logger.info("scheduler fired %d reminder(s)", fired)
    except Exception:  # noqa: BLE001
        logger.exception("scheduler tick failed")

    # Independently of reminders: put the demo clinic back if it has been worked
    # through and left idle. Wrapped separately so a restore failure cannot stop
    # reminders, and vice versa.
    try:
        await restore_if_idle()
    except Exception:  # noqa: BLE001
        logger.exception("demo restore check failed")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("reminder scheduler stopped")
