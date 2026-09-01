from fastapi import APIRouter

from app.api.v1 import (
    admin,
    attachments,
    exports,
    feedback,
    intake,
    interactions,
    notes,
    prescriptions,
    queue,
    reminders,
    stats,
    transcripts,
    vitals,
    voice,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(queue.router, tags=["queue"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(intake.router, tags=["intake"])
api_router.include_router(reminders.router, tags=["reminders"])
api_router.include_router(transcripts.router, tags=["transcripts"])
api_router.include_router(notes.router, tags=["notes"])
api_router.include_router(stats.router, tags=["stats"])
api_router.include_router(vitals.router, tags=["vitals"])
api_router.include_router(exports.router, tags=["exports"])
api_router.include_router(prescriptions.router, tags=["prescriptions"])
api_router.include_router(interactions.router, tags=["interactions"])
api_router.include_router(voice.router, tags=["voice"])
api_router.include_router(attachments.router, tags=["attachments"])
api_router.include_router(feedback.router, tags=["feedback"])
