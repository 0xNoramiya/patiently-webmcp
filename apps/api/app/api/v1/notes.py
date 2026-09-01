import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import require_admin
from app.services import notes as note_service

router = APIRouter()


class NoteOut(BaseModel):
    id: str
    ticket_id: str
    status: str
    subjective: str | None
    objective: str | None
    assessment: str | None
    plan: str | None
    model_used: str | None
    error: str | None
    created_at: str | None
    completed_at: str | None


@router.post(
    "/admin/tickets/{ticket_id}/notes",
    response_model=NoteOut,
    dependencies=[Depends(require_admin)],
)
async def draft(ticket_id: uuid.UUID) -> NoteOut:
    try:
        out = await note_service.draft_for_ticket(ticket_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"notes drafting failed: {e}"
        )
    return NoteOut(**out)


@router.get(
    "/admin/tickets/{ticket_id}/notes",
    response_model=NoteOut | None,
    dependencies=[Depends(require_admin)],
)
async def get_note(ticket_id: uuid.UUID) -> NoteOut | None:
    out = await note_service.get_for_ticket(ticket_id)
    return NoteOut(**out) if out else None
