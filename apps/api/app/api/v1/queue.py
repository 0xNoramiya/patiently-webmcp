import asyncio
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.db import get_db
from app.models.visit import Poli
from app.schemas.queue import QueueState, TicketDetail
from app.schemas.patient import PatientOut
from app.schemas.visit import VisitOut
from app.services import queue as queue_service
from app.services.events import bus
from app.agents.context import previous_visit_for

router = APIRouter()


@router.get("/queue/{poli}", response_model=QueueState)
async def get_queue(poli: Poli, db: AsyncSession = Depends(get_db)) -> QueueState:
    return await queue_service.get_queue_state(db, poli)


@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
async def get_ticket_detail(
    ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> TicketDetail:
    ticket = await queue_service.get_ticket(db, ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")

    prev = await previous_visit_for(db, ticket)
    flags = list(ticket.intake_session.triage_flags) if ticket.intake_session else []
    return TicketDetail(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        poli=ticket.poli,
        payer=ticket.payer,
        status=ticket.status,
        priority=ticket.priority,
        is_followup=ticket.is_followup,
        issued_at=ticket.issued_at,
        called_at=ticket.called_at,
        completed_at=ticket.completed_at,
        patient=PatientOut.model_validate(ticket.patient),
        previous_visit=VisitOut.model_validate(prev) if prev else None,
        triage_flags=flags,
        intake_complete=(
            ticket.intake_session is not None
            and ticket.intake_session.status.value == "completed"
        ),
    )


@router.post("/tickets/{ticket_id}/cancel", response_model=TicketDetail)
async def cancel(
    ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> TicketDetail:
    try:
        await queue_service.cancel_ticket(db, ticket_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    return await get_ticket_detail(ticket_id, db)


@router.get("/queue/{poli}/stream")
async def stream_queue(poli: Poli, request: Request):
    topic = f"poli:{poli.value}"
    q = await bus.subscribe(topic)

    async def event_generator():
        try:
            # initial snapshot ping
            yield {"event": "open", "data": "ok"}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield {"event": "message", "data": msg}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": ""}
        finally:
            await bus.unsubscribe(topic, q)

    return EventSourceResponse(event_generator())


@router.get("/tickets/{ticket_id}/stream")
async def stream_ticket(ticket_id: uuid.UUID, request: Request):
    topic = f"ticket:{ticket_id}"
    q = await bus.subscribe(topic)

    async def event_generator():
        try:
            yield {"event": "open", "data": "ok"}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield {"event": "message", "data": msg}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": ""}
        finally:
            await bus.unsubscribe(topic, q)

    return EventSourceResponse(event_generator())


@router.get("/dashboard/stream")
async def stream_dashboard(request: Request):
    topic = "dashboard"
    q = await bus.subscribe(topic)

    async def event_generator():
        try:
            yield {"event": "open", "data": "ok"}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield {"event": "message", "data": msg}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": ""}
        finally:
            await bus.unsubscribe(topic, q)

    return EventSourceResponse(event_generator())
