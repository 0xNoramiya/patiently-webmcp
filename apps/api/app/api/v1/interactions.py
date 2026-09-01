import uuid
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_admin
from app.services.interactions_for_ticket import check_for_ticket

router = APIRouter()


@router.get(
    "/admin/tickets/{ticket_id}/interactions",
    dependencies=[Depends(require_admin)],
)
async def get_interactions(ticket_id: uuid.UUID) -> dict[str, Any]:
    try:
        return await check_for_ticket(ticket_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
