import uuid
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.deps import require_admin
from app.services.pdf_export import build_pdf

router = APIRouter()


@router.get(
    "/admin/tickets/{ticket_id}/export/pdf",
    dependencies=[Depends(require_admin)],
)
async def export_pdf(ticket_id: uuid.UUID) -> Response:
    try:
        pdf_bytes, filename = await build_pdf(ticket_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, f"pdf build failed: {e}"
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
