from contextlib import asynccontextmanager
import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.services.scheduler import start_scheduler, stop_scheduler
from app.services.transcripts import STATIC_DIR

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Patiently API starting")
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("Patiently API stopping")


app = FastAPI(
    title="Patiently API",
    version="0.1.0",
    description="Multi-agent pre-visit intake & queue system for outpatient clinics",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated TTS audio so the dashboard can play it back.
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "clinic": settings.CLINIC_NAME}


app.include_router(api_router)
