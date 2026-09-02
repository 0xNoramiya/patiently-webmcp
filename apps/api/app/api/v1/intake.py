import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents import intake as intake_agent
from app.agents import summarizer as summarizer_agent
from app.core.db import SessionLocal, get_db
from app.models.intake import IntakeSession
from app.models.queue_ticket import QueueTicket
from app.schemas.intake import (
    AgentResponse,
    IntakeMessageOut,
    IntakeSessionOut,
    PatientMessageIn,
)
from app.services.events import bus

router = APIRouter()


async def _load_session_with_messages(
    db: AsyncSession, session_id: uuid.UUID
) -> IntakeSession | None:
    stmt = (
        select(IntakeSession)
        .where(IntakeSession.id == session_id)
        .options(selectinload(IntakeSession.messages))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _ticket_with_session(
    db: AsyncSession, ticket_id: uuid.UUID
) -> QueueTicket | None:
    stmt = (
        select(QueueTicket)
        .where(QueueTicket.id == ticket_id)
        .options(
            selectinload(QueueTicket.patient),
            selectinload(QueueTicket.intake_session).selectinload(
                IntakeSession.messages
            ),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.post("/intake/{ticket_id}/start", response_model=IntakeSessionOut)
async def start_intake(
    ticket_id: uuid.UUID,
    language: str = "en",
    db: AsyncSession = Depends(get_db),
) -> IntakeSessionOut:
    ticket = await _ticket_with_session(db, ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")

    if ticket.intake_session and ticket.intake_session.messages:
        session = await _load_session_with_messages(db, ticket.intake_session.id)
        await bus.publish(
            f"ticket:{ticket.id}",
            "intake_update",
            {"session_id": str(session.id)},
        )
        return IntakeSessionOut.model_validate(session)

    session, _ = await intake_agent.start_session(db, ticket, language=language)
    fresh = await _load_session_with_messages(db, session.id)
    await bus.publish(
        f"ticket:{ticket.id}",
        "intake_update",
        {"session_id": str(fresh.id)},
    )
    return IntakeSessionOut.model_validate(fresh)


@router.post(
    "/intake/{ticket_id}/message", response_model=AgentResponse
)
async def patient_message(
    ticket_id: uuid.UUID,
    payload: PatientMessageIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    ticket = await _ticket_with_session(db, ticket_id)
    if ticket is None or ticket.intake_session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "intake session not found")

    turn = await intake_agent.respond(
        db, ticket.intake_session.id, payload.content
    )

    await bus.publish(
        f"ticket:{ticket.id}",
        "intake_update",
        {"session_id": str(ticket.intake_session.id)},
    )

    if turn.is_complete:
        background.add_task(_run_summary, ticket.intake_session.id)

    return AgentResponse(
        reply_text=turn.reply_text,
        extracted_fields=turn.extracted_fields,
        triage_flags=turn.triage_flags,
        is_complete=turn.is_complete,
        triage_unavailable=turn.triage_unavailable,
    )


async def _run_summary(session_id: uuid.UUID) -> None:
    async with SessionLocal() as db:
        try:
            await summarizer_agent.summarize_session(db, session_id)
        except Exception:  # noqa: BLE001
            pass


@router.get("/intake/{ticket_id}/session", response_model=IntakeSessionOut)
async def session_state(
    ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> IntakeSessionOut:
    ticket = await _ticket_with_session(db, ticket_id)
    if ticket is None or ticket.intake_session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    fresh = await _load_session_with_messages(db, ticket.intake_session.id)
    return IntakeSessionOut.model_validate(fresh)


@router.post("/intake/{ticket_id}/complete", response_model=IntakeSessionOut)
async def force_complete(
    ticket_id: uuid.UUID,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> IntakeSessionOut:
    """Patient pressed 'Saya sudah selesai'."""
    ticket = await _ticket_with_session(db, ticket_id)
    if ticket is None or ticket.intake_session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    from datetime import datetime, timezone
    from app.models.intake import IntakeStatus
    from app.services import queue as queue_service

    session = ticket.intake_session
    if session.status == IntakeStatus.active:
        session.status = IntakeStatus.completed
        session.completed_at = datetime.now(timezone.utc)
        await queue_service.mark_intake_complete(db, ticket)
        await db.commit()
        background.add_task(_run_summary, session.id)

    fresh = await _load_session_with_messages(db, session.id)
    return IntakeSessionOut.model_validate(fresh)
