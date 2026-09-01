"""Patient attachment service — save, list, serve URL."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attachment import PatientAttachment
from app.models.queue_ticket import QueueTicket
from app.services.transcripts import STATIC_DIR

logger = logging.getLogger(__name__)

PHOTOS_DIR = STATIC_DIR / "photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 10 * 1024 * 1024  # 10 MB cap per upload
ALLOWED_MIME = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}
EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}


def _ext_for(mime: str) -> str:
    return EXT_BY_MIME.get((mime or "").lower(), ".bin")


async def save_attachment(
    db: AsyncSession,
    ticket_id: uuid.UUID,
    *,
    data: bytes,
    mime_type: str,
    caption: str | None = None,
) -> dict:
    if not data:
        raise ValueError("empty file")
    if len(data) > MAX_BYTES:
        raise ValueError(f"file too large ({len(data)} bytes); max {MAX_BYTES}")
    normalized = (mime_type or "application/octet-stream").lower().split(";")[0].strip()
    if normalized not in ALLOWED_MIME:
        raise ValueError(f"unsupported file type {normalized!r}")

    ticket = await db.get(QueueTicket, ticket_id)
    if ticket is None:
        raise ValueError("ticket not found")

    # ticket-scoped subdir keeps the static dir tidy
    target_dir = PHOTOS_DIR / str(ticket_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4()
    filename = f"{file_id}{_ext_for(normalized)}"
    target = target_dir / filename
    async with aiofiles.open(target, "wb") as f:
        await f.write(data)

    row = PatientAttachment(
        id=file_id,
        ticket_id=ticket_id,
        filename=filename,
        mime_type=normalized,
        size_bytes=len(data),
        caption=(caption or None) and caption.strip()[:255],
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _serialize(row)


async def list_attachments(db: AsyncSession, ticket_id: uuid.UUID) -> list[dict]:
    stmt = (
        select(PatientAttachment)
        .where(PatientAttachment.ticket_id == ticket_id)
        .order_by(PatientAttachment.created_at)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize(r) for r in rows]


async def delete_attachment(
    db: AsyncSession, ticket_id: uuid.UUID, attachment_id: uuid.UUID
) -> bool:
    row = await db.get(PatientAttachment, attachment_id)
    if row is None or row.ticket_id != ticket_id:
        return False
    try:
        path = PHOTOS_DIR / str(ticket_id) / row.filename
        if path.exists():
            os.remove(path)
    except Exception as e:  # noqa: BLE001
        logger.warning("could not remove attachment file: %s", e)
    await db.delete(row)
    await db.commit()
    return True


def _serialize(r: PatientAttachment) -> dict:
    return {
        "id": str(r.id),
        "ticket_id": str(r.ticket_id),
        "filename": r.filename,
        "mime_type": r.mime_type,
        "size_bytes": r.size_bytes,
        "caption": r.caption,
        "url": f"/api/static/photos/{r.ticket_id}/{r.filename}",
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
