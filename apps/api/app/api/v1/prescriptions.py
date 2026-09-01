import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import require_admin
from app.services import prescriptions as rx_service

router = APIRouter()


class PrescriptionOut(BaseModel):
    id: str
    ticket_id: str
    drug_name: str
    dose: str
    frequency: str
    duration_days: int
    instructions: str | None
    rationale: str | None
    source: str
    approved: bool
    created_at: str | None


class ApproveBody(BaseModel):
    approved: bool = True


@router.post(
    "/admin/tickets/{ticket_id}/prescriptions/draft",
    response_model=list[PrescriptionOut],
    dependencies=[Depends(require_admin)],
)
async def draft(ticket_id: uuid.UUID) -> list[PrescriptionOut]:
    try:
        rows = await rx_service.draft_for_ticket(ticket_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"prescription drafting failed: {e}"
        )
    return [PrescriptionOut(**r) for r in rows]


@router.get(
    "/admin/tickets/{ticket_id}/prescriptions",
    response_model=list[PrescriptionOut],
    dependencies=[Depends(require_admin)],
)
async def list_rx(ticket_id: uuid.UUID) -> list[PrescriptionOut]:
    rows = await rx_service.list_for_ticket(ticket_id)
    return [PrescriptionOut(**r) for r in rows]


@router.post(
    "/admin/prescriptions/{prescription_id}/approve",
    response_model=PrescriptionOut,
    dependencies=[Depends(require_admin)],
)
async def approve(
    prescription_id: uuid.UUID,
    body: ApproveBody | None = None,
) -> PrescriptionOut:
    approved = body.approved if body else True
    row = await rx_service.set_approved(prescription_id, approved)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "prescription not found")
    return PrescriptionOut(**row)
