import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.feedback import VisitFeedback
from app.models.queue_ticket import QueueTicket

router = APIRouter()


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    nps: int | None = Field(default=None, ge=0, le=10)
    comment: str | None = Field(default=None, max_length=2000)


class FeedbackOut(BaseModel):
    id: str
    ticket_id: str
    rating: int
    nps: int | None
    comment: str | None
    created_at: str
    updated_at: str


def _serialize(f: VisitFeedback) -> FeedbackOut:
    return FeedbackOut(
        id=str(f.id),
        ticket_id=str(f.ticket_id),
        rating=f.rating,
        nps=f.nps,
        comment=f.comment,
        created_at=f.created_at.isoformat() if f.created_at else "",
        updated_at=f.updated_at.isoformat() if f.updated_at else "",
    )


@router.post(
    "/intake/{ticket_id}/feedback",
    response_model=FeedbackOut,
)
async def submit(
    ticket_id: uuid.UUID,
    payload: FeedbackIn,
    db: AsyncSession = Depends(get_db),
) -> FeedbackOut:
    ticket = await db.get(QueueTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")

    stmt = select(VisitFeedback).where(VisitFeedback.ticket_id == ticket_id)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    comment = (payload.comment or "").strip() or None

    if existing is None:
        row = VisitFeedback(
            ticket_id=ticket_id,
            rating=payload.rating,
            nps=payload.nps,
            comment=comment,
        )
        db.add(row)
    else:
        existing.rating = payload.rating
        existing.nps = payload.nps
        existing.comment = comment
        existing.updated_at = datetime.now(timezone.utc)
        row = existing

    await db.commit()
    await db.refresh(row)
    return _serialize(row)


@router.get(
    "/intake/{ticket_id}/feedback",
    response_model=FeedbackOut | None,
)
async def get(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> FeedbackOut | None:
    stmt = select(VisitFeedback).where(VisitFeedback.ticket_id == ticket_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    return _serialize(row) if row else None
