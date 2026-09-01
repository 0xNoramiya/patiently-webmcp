import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_admin
from app.core.db import get_db
from app.models.reminder import AppointmentReminder
from app.schemas.patient import PatientOut
from app.schemas.reminder import ReminderOut
from app.services import reminders as reminder_service

router = APIRouter()


def _to_out(r: AppointmentReminder) -> ReminderOut:
    return ReminderOut(
        id=r.id,
        patient=PatientOut.model_validate(r.patient),
        scheduled_for=r.scheduled_for,
        appointment_at=r.appointment_at,
        reason=r.reason,
        channel=r.channel,
        status=r.status,
        message=r.message,
        model_used=r.model_used,
        error=r.error,
        generated_at=r.generated_at,
        sent_at=r.sent_at,
        created_at=r.created_at,
    )


@router.get(
    "/admin/reminders",
    response_model=list[ReminderOut],
    dependencies=[Depends(require_admin)],
)
async def list_reminders(
    db: AsyncSession = Depends(get_db),
) -> list[ReminderOut]:
    stmt = (
        select(AppointmentReminder)
        .options(selectinload(AppointmentReminder.patient))
        .order_by(AppointmentReminder.scheduled_for)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.post(
    "/admin/reminders/{reminder_id}/fire",
    response_model=ReminderOut,
    dependencies=[Depends(require_admin)],
)
async def fire_now(reminder_id: uuid.UUID) -> ReminderOut:
    try:
        r = await reminder_service.fire_reminder(reminder_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reminder not found")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"reminder failed: {e}",
        )
    return _to_out(r)


@router.post(
    "/admin/reminders/run-due",
    dependencies=[Depends(require_admin)],
)
async def run_due() -> dict[str, int]:
    fired = await reminder_service.fire_due_reminders()
    return {"fired": fired}
