from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.db import get_db
from app.services.stats import compute_stats

router = APIRouter()


@router.get(
    "/admin/stats",
    dependencies=[Depends(require_admin)],
)
async def get_stats(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await compute_stats(db)
