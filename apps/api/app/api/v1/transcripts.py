import uuid
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_admin
from app.schemas.reminder import TranscriptOut
from app.services import transcripts as transcript_service

router = APIRouter()


@router.post(
    "/admin/tickets/{ticket_id}/transcript",
    response_model=TranscriptOut,
    dependencies=[Depends(require_admin)],
)
async def generate(ticket_id: uuid.UUID) -> TranscriptOut:
    try:
        out = await transcript_service.generate_and_transcribe(ticket_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"transcription failed: {e}",
        )
    return TranscriptOut(**out)


@router.get(
    "/admin/tickets/{ticket_id}/transcript",
    response_model=TranscriptOut | None,
    dependencies=[Depends(require_admin)],
)
async def get_transcript(ticket_id: uuid.UUID) -> TranscriptOut | None:
    out = await transcript_service.get_transcript_for_ticket(ticket_id)
    if out is None:
        return None
    return TranscriptOut(**out)
