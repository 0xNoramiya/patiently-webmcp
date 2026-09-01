"""Seed Patiently Demo Clinic with patients, historical visits, prescriptions, and active tickets."""
from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete

from app.core.db import Base, SessionLocal, engine
import app.models  # noqa: F401
from app.models.intake import IntakeMessage, IntakeSession
from app.models.patient import Patient, Sex
from app.models.prescription import Prescription
from app.models.queue_ticket import Payer, QueueTicket, TicketStatus
from app.models.reminder import AppointmentReminder, ReminderStatus
from app.models.transcript import ConsultationTranscript
from app.models.visit import Poli, Visit


async def _reset(db) -> None:
    for model in (
        ConsultationTranscript,
        AppointmentReminder,
        IntakeMessage,
        IntakeSession,
        QueueTicket,
        Prescription,
        Visit,
        Patient,
    ):
        await db.execute(delete(model))
    await db.commit()


def _years_ago(years: int, month: int = 6, day: int = 15) -> date:
    return date(date.today().year - years, month, day)


async def _seed(db) -> None:
    today = date.today()

    patients: dict[str, Patient] = {}

    p_sari = Patient(
        id=uuid.uuid4(),
        nik="P-001",
        name="Sarah Walters",
        dob=_years_ago(34, 3, 5),
        sex=Sex.F,
        phone="555-0101",
        bpjs_number="INS-1001",
    )
    patients["sarah"] = p_sari

    p_hendra = Patient(
        id=uuid.uuid4(),
        nik="P-002",
        name="Henry Sutton",
        dob=_years_ago(58, 8, 12),
        sex=Sex.M,
        phone="555-0102",
        bpjs_number="INS-1002",
    )
    patients["henry"] = p_hendra

    p_rian = Patient(
        id=uuid.uuid4(),
        nik=None,
        name="Ryan Parker",
        dob=_years_ago(5, 11, 2),
        sex=Sex.M,
        phone="555-0103",
        bpjs_number="INS-1003",
    )
    patients["ryan"] = p_rian

    p_budi = Patient(
        id=uuid.uuid4(),
        nik="P-004",
        name="Bruce Hartman",
        dob=_years_ago(52, 2, 26),
        sex=Sex.M,
        phone="555-0104",
        bpjs_number=None,
    )
    patients["bruce"] = p_budi

    p_lina = Patient(
        id=uuid.uuid4(),
        nik="P-005",
        name="Lina Morales",
        dob=_years_ago(28, 8, 7),
        sex=Sex.F,
        phone="555-0105",
        bpjs_number="INS-1005",
    )
    patients["lina"] = p_lina

    p_wati = Patient(
        id=uuid.uuid4(),
        nik="P-006",
        name="Wendy Suarez",
        dob=_years_ago(67, 1, 15),
        sex=Sex.F,
        phone="555-0106",
        bpjs_number="INS-1006",
    )
    patients["wendy"] = p_wati

    p_arif = Patient(
        id=uuid.uuid4(),
        nik="P-007",
        name="Aaron Maguire",
        dob=_years_ago(32, 9, 11),
        sex=Sex.M,
        phone="555-0107",
        bpjs_number="INS-1007",
    )
    patients["aaron"] = p_arif

    p_nia = Patient(
        id=uuid.uuid4(),
        nik=None,
        name="Nina Sandoval",
        dob=_years_ago(7, 4, 19),
        sex=Sex.F,
        phone="555-0108",
        bpjs_number="INS-1008",
    )
    patients["nina"] = p_nia

    for p in patients.values():
        db.add(p)
    await db.flush()

    # === HISTORICAL VISITS + PRESCRIPTIONS ===

    # Sarah — 7 days ago, productive cough → ambroxol
    v_sari = Visit(
        id=uuid.uuid4(),
        patient_id=p_sari.id,
        visit_date=today - timedelta(days=7),
        poli=Poli.umum,
        chief_complaint="Productive cough × 4 days, mild fever",
        diagnosis_icd10="J06.9",
        notes="Acute viral URI. No signs of pneumonia.",
        prescriber_id="Dr. Priya Rahman",
    )
    db.add(v_sari)
    await db.flush()
    db.add_all(
        [
            Prescription(
                visit_id=v_sari.id,
                drug_name="Ambroxol",
                dose="30 mg",
                frequency="3× daily",
                duration_days=5,
                instructions="After meals",
            ),
            Prescription(
                visit_id=v_sari.id,
                drug_name="Paracetamol",
                dose="500 mg",
                frequency="3× daily PRN fever",
                duration_days=3,
                instructions="As needed",
            ),
        ]
    )

    # Henry — 14 days ago, HT follow-up → amlodipine
    v_hendra = Visit(
        id=uuid.uuid4(),
        patient_id=p_hendra.id,
        visit_date=today - timedelta(days=14),
        poli=Poli.umum,
        chief_complaint="Hypertension follow-up. BP today 158/96.",
        diagnosis_icd10="I10",
        notes="Stage 1 hypertension. Started amlodipine.",
        prescriber_id="Dr. Priya Rahman",
    )
    db.add(v_hendra)
    await db.flush()
    db.add(
        Prescription(
            visit_id=v_hendra.id,
            drug_name="Amlodipine",
            dose="5 mg",
            frequency="Once daily (morning)",
            duration_days=30,
            instructions="Take every morning",
        )
    )

    # Ryan — 5 days ago, AOM → amoxicillin syrup
    v_rian = Visit(
        id=uuid.uuid4(),
        patient_id=p_rian.id,
        visit_date=today - timedelta(days=5),
        poli=Poli.anak,
        chief_complaint="Right ear pain × 2 days, irritable, fever",
        diagnosis_icd10="H66.9",
        notes="Acute otitis media, right. TM bulging and erythematous.",
        prescriber_id="Dr. Andrew Pierce",
    )
    db.add(v_rian)
    await db.flush()
    db.add_all(
        [
            Prescription(
                visit_id=v_rian.id,
                drug_name="Amoxicillin suspension",
                dose="125 mg / 5 mL",
                frequency="1 teaspoon 3× daily",
                duration_days=7,
                instructions="Finish the full course",
            ),
            Prescription(
                visit_id=v_rian.id,
                drug_name="Paracetamol suspension",
                dose="120 mg / 5 mL",
                frequency="3-4× daily PRN",
                duration_days=5,
                instructions="As needed for fever / pain",
            ),
        ]
    )

    # Wendy — older OA visit 3 months ago
    v_wati_old = Visit(
        id=uuid.uuid4(),
        patient_id=p_wati.id,
        visit_date=today - timedelta(days=92),
        poli=Poli.lansia,
        chief_complaint="Chronic bilateral knee pain",
        diagnosis_icd10="M17.0",
        notes="Primary osteoarthritis, bilateral.",
        prescriber_id="Dr. Samuel Wilson",
    )
    db.add(v_wati_old)
    await db.flush()
    db.add(
        Prescription(
            visit_id=v_wati_old.id,
            drug_name="Paracetamol",
            dose="500 mg",
            frequency="3× daily PRN pain",
            duration_days=14,
            instructions="Avoid on empty stomach",
        )
    )

    # === ACTIVE QUEUE TICKETS (today) ===
    base = datetime.now(timezone.utc) - timedelta(minutes=45)

    def issued(minutes_ago: int) -> datetime:
        return base + timedelta(minutes=minutes_ago)

    tickets: list[QueueTicket] = []

    # General Clinic — A series
    tickets.append(
        QueueTicket(
            ticket_number="A-001",
            patient_id=p_sari.id,
            poli=Poli.umum,
            payer=Payer.bpjs,
            status=TicketStatus.waiting,
            is_followup=True,
            issued_at=issued(0),
        )
    )
    tickets.append(
        QueueTicket(
            ticket_number="A-002",
            patient_id=p_hendra.id,
            poli=Poli.umum,
            payer=Payer.bpjs,
            status=TicketStatus.waiting,
            is_followup=True,
            issued_at=issued(3),
        )
    )
    tickets.append(
        QueueTicket(
            ticket_number="A-003",
            patient_id=p_budi.id,
            poli=Poli.umum,
            payer=Payer.umum,
            status=TicketStatus.waiting,
            is_followup=False,
            issued_at=issued(8),
        )
    )
    tickets.append(
        QueueTicket(
            ticket_number="A-004",
            patient_id=p_arif.id,
            poli=Poli.umum,
            payer=Payer.bpjs,
            status=TicketStatus.waiting,
            is_followup=False,
            issued_at=issued(15),
        )
    )

    # Pediatrics — B series
    tickets.append(
        QueueTicket(
            ticket_number="B-001",
            patient_id=p_rian.id,
            poli=Poli.anak,
            payer=Payer.bpjs,
            status=TicketStatus.waiting,
            is_followup=True,
            issued_at=issued(5),
        )
    )
    tickets.append(
        QueueTicket(
            ticket_number="B-002",
            patient_id=p_nia.id,
            poli=Poli.anak,
            payer=Payer.bpjs,
            status=TicketStatus.waiting,
            is_followup=False,
            issued_at=issued(20),
        )
    )

    # OB-GYN — C series
    tickets.append(
        QueueTicket(
            ticket_number="C-001",
            patient_id=p_lina.id,
            poli=Poli.kia,
            payer=Payer.bpjs,
            status=TicketStatus.waiting,
            is_followup=False,
            issued_at=issued(10),
        )
    )

    # Geriatrics — E series
    tickets.append(
        QueueTicket(
            ticket_number="E-001",
            patient_id=p_wati.id,
            poli=Poli.lansia,
            payer=Payer.bpjs,
            status=TicketStatus.waiting,
            is_followup=False,
            issued_at=issued(12),
        )
    )

    for t in tickets:
        db.add(t)

    await db.commit()

    # === APPOINTMENT REMINDERS (Featherless workflow) ===
    now_utc = datetime.now(timezone.utc)

    reminders = [
        # Already due — picks up on next scheduler tick (or run-due endpoint)
        AppointmentReminder(
            patient_id=p_hendra.id,
            visit_id=v_hendra.id,
            scheduled_for=now_utc - timedelta(minutes=2),
            appointment_at=now_utc + timedelta(days=14),
            reason="Hypertension follow-up — BP recheck",
            channel="sms",
        ),
        # Fires in 90 seconds — lets you watch the scheduler kick off live
        AppointmentReminder(
            patient_id=p_rian.id,
            visit_id=v_rian.id,
            scheduled_for=now_utc + timedelta(seconds=90),
            appointment_at=now_utc + timedelta(days=2),
            reason="Otitis media follow-up — check ear improvement",
            channel="sms",
        ),
        # Scheduled in a few minutes
        AppointmentReminder(
            patient_id=p_sari.id,
            visit_id=v_sari.id,
            scheduled_for=now_utc + timedelta(minutes=5),
            appointment_at=now_utc + timedelta(days=7),
            reason="Cough follow-up if symptoms return",
            channel="sms",
        ),
        # Further out — visible in the queue but not due yet
        AppointmentReminder(
            patient_id=p_wati.id,
            visit_id=v_wati_old.id,
            scheduled_for=now_utc + timedelta(hours=6),
            appointment_at=now_utc + timedelta(days=30),
            reason="Knee pain follow-up — discuss physical therapy plan",
            channel="sms",
        ),
    ]
    for r in reminders:
        db.add(r)
    await db.commit()

    print(f"Seeded {len(patients)} patients, {len(tickets)} tickets, {len(reminders)} reminders.")
    for key, p in patients.items():
        print(f"  {key:8s} {p.id}  {p.name}")


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        await _reset(db)
        await _seed(db)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
