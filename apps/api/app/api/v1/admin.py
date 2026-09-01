import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_admin, require_receptionist
from app.core.db import get_db
from app.models.patient import Patient
from app.models.queue_ticket import QueueTicket
from app.models.visit import Poli
from app.schemas.queue import IssueTicketRequest, TicketDetail
from app.schemas.patient import PatientOut
from app.schemas.visit import VisitOut
from app.services import queue as queue_service
from app.agents.context import previous_visit_for

router = APIRouter()


@router.post(
    "/admin/tickets",
    response_model=TicketDetail,
    dependencies=[Depends(require_receptionist)],
)
async def issue(
    payload: IssueTicketRequest, db: AsyncSession = Depends(get_db)
) -> TicketDetail:
    patient = await db.get(Patient, payload.patient_id)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "patient not found")
    ticket = await queue_service.issue_ticket(
        db, payload.patient_id, payload.poli, payload.payer
    )
    prev = await previous_visit_for(db, ticket)
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
        patient=PatientOut.model_validate(patient),
        previous_visit=VisitOut.model_validate(prev) if prev else None,
        triage_flags=[],
        intake_complete=False,
    )


@router.post(
    "/admin/tickets/{ticket_id}/call",
    response_model=TicketDetail,
    dependencies=[Depends(require_admin)],
)
async def call_next_ticket(
    ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> TicketDetail:
    try:
        ticket = await queue_service.call_next(db, ticket_id)
    except ValueError:
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


@router.post(
    "/admin/tickets/{ticket_id}/complete",
    response_model=TicketDetail,
    dependencies=[Depends(require_admin)],
)
async def complete(
    ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> TicketDetail:
    try:
        ticket = await queue_service.complete_ticket(db, ticket_id)
    except ValueError:
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


@router.get("/admin/dashboard/auth", dependencies=[Depends(require_admin)])
async def dashboard_auth() -> dict[str, bool]:
    return {"ok": True}


@router.get(
    "/admin/patients",
    response_model=list[PatientOut],
    dependencies=[Depends(require_receptionist)],
)
async def list_patients(db: AsyncSession = Depends(get_db)) -> list[PatientOut]:
    stmt = select(Patient).order_by(Patient.name)
    rows = (await db.execute(stmt)).scalars().all()
    return [PatientOut.model_validate(p) for p in rows]
