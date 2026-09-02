import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services import attachments as att_service

router = APIRouter()


class AttachmentOut(BaseModel):
    id: str
    ticket_id: str
    filename: str
    mime_type: str
    size_bytes: int
    caption: str | None
    url: str
    created_at: str | None


@router.post(
    "/intake/{ticket_id}/photos",
    response_model=AttachmentOut,
)
async def upload(
    ticket_id: uuid.UUID,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
) -> AttachmentOut:
    # Reject on the declared size before materialising the body. Starlette
    # spools large uploads to disk, so this is not the memory cliff it looks
    # like, but there is no reason to read 60 MB only to throw it away.
    declared = getattr(file, "size", None)
    if declared is not None and declared > att_service.MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"file too large ({declared} bytes); max {att_service.MAX_BYTES}",
        )

    data = await file.read()
    try:
        row = await att_service.save_attachment(
            db,
            ticket_id,
            data=data,
            mime_type=file.content_type or "",
            caption=caption,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg:
            raise HTTPException(status.HTTP_404_NOT_FOUND, msg)
        if "too large" in msg:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, msg)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)
    return AttachmentOut(**row)


@router.get(
    "/intake/{ticket_id}/photos",
    response_model=list[AttachmentOut],
)
async def list_photos(
    ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[AttachmentOut]:
    rows = await att_service.list_attachments(db, ticket_id)
    return [AttachmentOut(**r) for r in rows]


@router.delete(
    "/intake/{ticket_id}/photos/{attachment_id}",
)
async def delete_photo(
    ticket_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    ok = await att_service.delete_attachment(db, ticket_id, attachment_id)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "attachment not found")
    return {"deleted": True}
