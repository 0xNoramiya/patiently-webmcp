import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.db import get_db
from app.services import vitals as vitals_service

router = APIRouter()


class VitalsIn(BaseModel):
    systolic_bp: int | None = Field(default=None, ge=40, le=300)
    diastolic_bp: int | None = Field(default=None, ge=20, le=200)
    heart_rate: int | None = Field(default=None, ge=20, le=300)
    respiratory_rate: int | None = Field(default=None, ge=4, le=60)
    temperature_c: float | None = Field(default=None, ge=30.0, le=43.0)
    spo2: int | None = Field(default=None, ge=40, le=100)
    weight_kg: float | None = Field(default=None, gt=0, le=400)
    height_cm: float | None = Field(default=None, gt=0, le=260)
    pain_score: int | None = Field(default=None, ge=0, le=10)
    recorded_by: str | None = Field(default=None, max_length=120)


@router.post(
    "/admin/tickets/{ticket_id}/vitals",
    dependencies=[Depends(require_admin)],
)
async def upsert(
    ticket_id: uuid.UUID,
    payload: VitalsIn,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        return await vitals_service.upsert_vitals(
            db, ticket_id, payload.model_dump()
        )
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found")


@router.get(
    "/admin/tickets/{ticket_id}/vitals",
    dependencies=[Depends(require_admin)],
)
async def get_vitals(
    ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict | None:
    return await vitals_service.get_vitals(db, ticket_id)
