"""Queue state machine.

Ordering rule: tickets sorted by (-priority, issued_at). A bumped triage
ticket jumps ahead of everyone with lower priority but keeps FIFO with peers.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import and_, desc, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.intake import IntakeSession, IntakeStatus
from app.models.patient import Patient
from app.models.queue_ticket import Payer, QueueTicket, TicketStatus
from app.models.visit import POLI_PREFIX, Poli, Visit
from app.schemas.queue import QueueEntry, QueueState, TicketOut
from app.schemas.patient import PatientOut
from app.services.eta import avg_consultation_minutes, eta_range
from app.services.events import bus
from app.services.triage import max_priority_for


ACTIVE_STATUSES = (
    TicketStatus.waiting,
    TicketStatus.in_intake,
    TicketStatus.intake_complete,
    TicketStatus.in_consultation,
)


async def _next_ticket_number(db: AsyncSession, poli: Poli) -> str:
    """Compute the next ticket number for the poli today.

    We anchor on UTC so the same logical day is used on both Python and
    PostgreSQL regardless of session timezone. Tickets issued in the prior
    24h window are considered "today's" tickets for numbering purposes.
    """
    prefix = POLI_PREFIX[poli]
    now_utc = datetime.now(timezone.utc)
    day_start = now_utc - timedelta(hours=24)
    stmt = select(func.count()).select_from(QueueTicket).where(
        and_(
            QueueTicket.poli == poli,
            QueueTicket.issued_at >= day_start,
        )
    )
    count = (await db.execute(stmt)).scalar_one()
    return f"{prefix}-{count + 1:03d}"


async def _detect_followup(
    db: AsyncSession, patient_id: uuid.UUID, poli: Poli
) -> Visit | None:
    cutoff = date.today() - timedelta(days=30)
    stmt = (
        select(Visit)
        .where(
            and_(
                Visit.patient_id == patient_id,
                Visit.poli == poli,
                Visit.visit_date >= cutoff,
                Visit.visit_date <= date.today(),
            )
        )
        .options(selectinload(Visit.prescriptions))
        .order_by(desc(Visit.visit_date))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def issue_ticket(
    db: AsyncSession,
    patient_id: uuid.UUID,
    poli: Poli,
    payer: Payer = Payer.bpjs,
) -> QueueTicket:
    number = await _next_ticket_number(db, poli)
    followup = await _detect_followup(db, patient_id, poli)
    ticket = QueueTicket(
        ticket_number=number,
        patient_id=patient_id,
        poli=poli,
        payer=payer,
        status=TicketStatus.waiting,
        priority=0,
        is_followup=followup is not None,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    await bus.publish_many(
        [f"poli:{poli.value}", "dashboard"],
        "queue_update",
        {"poli": poli.value, "ticket_id": str(ticket.id)},
    )
    return ticket


async def get_ticket(
    db: AsyncSession, ticket_id: uuid.UUID
) -> QueueTicket | None:
    stmt = (
        select(QueueTicket)
        .where(QueueTicket.id == ticket_id)
        .options(
            selectinload(QueueTicket.patient),
            selectinload(QueueTicket.intake_session),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_active_tickets(
    db: AsyncSession, poli: Poli
) -> list[QueueTicket]:
    """Active tickets issued in the last 24h, sorted by (-priority, issued_at)."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    stmt = (
        select(QueueTicket)
        .where(
            and_(
                QueueTicket.poli == poli,
                QueueTicket.status.in_(ACTIVE_STATUSES),
                QueueTicket.issued_at >= cutoff,
            )
        )
        .options(
            selectinload(QueueTicket.patient),
            selectinload(QueueTicket.intake_session),
        )
        .order_by(desc(QueueTicket.priority), QueueTicket.issued_at)
    )
    return list((await db.execute(stmt)).scalars().all())


def _waiting_position(tickets: list[QueueTicket], target: QueueTicket) -> int:
    waiting = [
        t
        for t in tickets
        if t.status
        in (
            TicketStatus.waiting,
            TicketStatus.in_intake,
            TicketStatus.intake_complete,
        )
    ]
    waiting.sort(key=lambda t: (-t.priority, t.issued_at))
    for i, t in enumerate(waiting, start=1):
        if t.id == target.id:
            return i
    return len(waiting) + 1


async def get_queue_state(db: AsyncSession, poli: Poli) -> QueueState:
    tickets = await get_active_tickets(db, poli)
    avg = await avg_consultation_minutes(db, poli)

    now_serving = next(
        (t for t in tickets if t.status == TicketStatus.in_consultation), None
    )

    buckets: dict[TicketStatus, list[QueueEntry]] = {
        s: [] for s in ACTIVE_STATUSES
    }
    waiting_sorted = sorted(
        [
            t
            for t in tickets
            if t.status
            in (
                TicketStatus.waiting,
                TicketStatus.in_intake,
                TicketStatus.intake_complete,
            )
        ],
        key=lambda t: (-t.priority, t.issued_at),
    )

    pos_map: dict[uuid.UUID, int] = {t.id: i for i, t in enumerate(waiting_sorted, start=1)}

    for t in tickets:
        position = pos_map.get(t.id, 0)
        low, high = eta_range(max(position, 0), avg)
        flags = list(t.intake_session.triage_flags) if t.intake_session else []
        entry = QueueEntry(
            ticket=TicketOut.model_validate(t),
            patient=PatientOut.model_validate(t.patient),
            position=position,
            eta_minutes_low=low,
            eta_minutes_high=high,
            triage_flags=flags,
        )
        buckets[t.status].append(entry)

    return QueueState(
        poli=poli,
        now_serving=TicketOut.model_validate(now_serving) if now_serving else None,
        avg_consultation_minutes=round(avg, 1),
        waiting=buckets[TicketStatus.waiting],
        in_intake=buckets[TicketStatus.in_intake],
        intake_complete=buckets[TicketStatus.intake_complete],
        in_consultation=buckets[TicketStatus.in_consultation],
    )


async def call_next(db: AsyncSession, ticket_id: uuid.UUID) -> QueueTicket:
    ticket = await get_ticket(db, ticket_id)
    if ticket is None:
        raise ValueError("ticket not found")
    ticket.status = TicketStatus.in_consultation
    ticket.called_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket)
    await bus.publish_many(
        [f"poli:{ticket.poli.value}", "dashboard", f"ticket:{ticket.id}"],
        "ticket_called",
        {"ticket_id": str(ticket.id), "poli": ticket.poli.value},
    )
    return ticket


async def complete_ticket(db: AsyncSession, ticket_id: uuid.UUID) -> QueueTicket:
    ticket = await get_ticket(db, ticket_id)
    if ticket is None:
        raise ValueError("ticket not found")
    ticket.status = TicketStatus.done
    ticket.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket)
    await bus.publish_many(
        [f"poli:{ticket.poli.value}", "dashboard", f"ticket:{ticket.id}"],
        "ticket_completed",
        {"ticket_id": str(ticket.id), "poli": ticket.poli.value},
    )
    return ticket


async def cancel_ticket(db: AsyncSession, ticket_id: uuid.UUID) -> QueueTicket:
    ticket = await get_ticket(db, ticket_id)
    if ticket is None:
        raise ValueError("ticket not found")
    ticket.status = TicketStatus.cancelled
    await db.commit()
    await db.refresh(ticket)
    await bus.publish_many(
        [f"poli:{ticket.poli.value}", "dashboard", f"ticket:{ticket.id}"],
        "ticket_cancelled",
        {"ticket_id": str(ticket.id), "poli": ticket.poli.value},
    )
    return ticket


async def bump_priority(
    db: AsyncSession,
    ticket_id: uuid.UUID,
    triage_flags: list[str],
) -> QueueTicket:
    """Set priority to max derived from flags. No-op if current is already higher."""
    ticket = await get_ticket(db, ticket_id)
    if ticket is None:
        raise ValueError("ticket not found")
    new_priority = max_priority_for(triage_flags)
    if new_priority > ticket.priority:
        ticket.priority = new_priority
        await db.commit()
        await db.refresh(ticket)
        await bus.publish_many(
            [f"poli:{ticket.poli.value}", "dashboard", f"ticket:{ticket.id}"],
            "triage_alert",
            {
                "ticket_id": str(ticket.id),
                "ticket_number": ticket.ticket_number,
                "poli": ticket.poli.value,
                "patient_name": ticket.patient.name if ticket.patient else "",
                "flags": triage_flags,
                "priority": new_priority,
            },
        )
    return ticket


async def mark_intake_started(db: AsyncSession, ticket: QueueTicket) -> None:
    if ticket.status == TicketStatus.waiting:
        ticket.status = TicketStatus.in_intake
        await db.commit()
        await bus.publish_many(
            [f"poli:{ticket.poli.value}", "dashboard"],
            "queue_update",
            {"poli": ticket.poli.value, "ticket_id": str(ticket.id)},
        )


async def mark_intake_complete(db: AsyncSession, ticket: QueueTicket) -> None:
    if ticket.status in (TicketStatus.in_intake, TicketStatus.waiting):
        ticket.status = TicketStatus.intake_complete
        await db.commit()
        await bus.publish_many(
            [f"poli:{ticket.poli.value}", "dashboard"],
            "queue_update",
            {"poli": ticket.poli.value, "ticket_id": str(ticket.id)},
        )
