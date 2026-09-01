"""Visit-chart PDF export.

Bundles everything the system knows about a single ticket into an A4 PDF the
physician can print, sign, and clip to the paper chart (or attach to an EMR):

  - clinic header + ticket number + date
  - patient identity block
  - vitals on arrival (critical findings highlighted)
  - pre-visit summary written by the Summarizer Agent
  - follow-up delta when applicable
  - speaker-diarized consultation transcript (truncated)
  - SOAP note drafted by Featherless
  - footer disclaimer

Built with ReportLab platypus — no system binaries needed, ships in the
docker image as a pip wheel.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.context import previous_visit_for
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models.intake import IntakeSession
from app.models.note import ConsultationNote, NoteStatus
from app.models.prescription_draft import PrescriptionDraft
from app.models.queue_ticket import QueueTicket
from app.models.transcript import ConsultationTranscript, TranscriptStatus
from app.models.vital_signs import VitalSigns
from app.services.vitals import CRITICAL_LABELS


BRAND = colors.HexColor("#0e8265")
INK = colors.HexColor("#1e293b")
INK_500 = colors.HexColor("#475569")
INK_400 = colors.HexColor("#64748b")
INK_100 = colors.HexColor("#e2e8f0")
ALERT = colors.HexColor("#b91c1c")
ALERT_50 = colors.HexColor("#fef2f2")
BRAND_50 = colors.HexColor("#ecfdf5")


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontSize=18,
            leading=22,
            textColor=INK,
            spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["Normal"],
            fontSize=9,
            leading=12,
            textColor=INK_400,
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontSize=10,
            leading=14,
            textColor=BRAND,
            spaceBefore=10,
            spaceAfter=4,
            fontName="Helvetica-Bold",
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontSize=10,
            leading=14,
            textColor=INK,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontSize=8.5,
            leading=11,
            textColor=INK_500,
        ),
        "tinyLabel": ParagraphStyle(
            "tinyLabel",
            parent=base["BodyText"],
            fontSize=7.5,
            leading=9,
            textColor=INK_400,
            fontName="Helvetica-Bold",
        ),
        "alert": ParagraphStyle(
            "alert",
            parent=base["BodyText"],
            fontSize=10,
            leading=14,
            textColor=ALERT,
            fontName="Helvetica-Bold",
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["BodyText"],
            fontSize=7.5,
            leading=10,
            textColor=INK_400,
            alignment=1,
        ),
    }


async def _load(db: AsyncSession, ticket_id: uuid.UUID):
    stmt = (
        select(QueueTicket)
        .where(QueueTicket.id == ticket_id)
        .options(
            selectinload(QueueTicket.patient),
            selectinload(QueueTicket.intake_session),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _vitals(db: AsyncSession, ticket_id: uuid.UUID) -> VitalSigns | None:
    stmt = select(VitalSigns).where(VitalSigns.ticket_id == ticket_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _latest_transcript(
    db: AsyncSession, ticket_id: uuid.UUID
) -> ConsultationTranscript | None:
    stmt = (
        select(ConsultationTranscript)
        .where(ConsultationTranscript.ticket_id == ticket_id)
        .where(ConsultationTranscript.status == TranscriptStatus.done)
        .order_by(ConsultationTranscript.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _prescriptions(
    db: AsyncSession, ticket_id: uuid.UUID
) -> list[PrescriptionDraft]:
    stmt = (
        select(PrescriptionDraft)
        .where(PrescriptionDraft.ticket_id == ticket_id)
        .order_by(PrescriptionDraft.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def _latest_note(
    db: AsyncSession, ticket_id: uuid.UUID
) -> ConsultationNote | None:
    stmt = (
        select(ConsultationNote)
        .where(ConsultationNote.ticket_id == ticket_id)
        .where(ConsultationNote.status == NoteStatus.done)
        .order_by(ConsultationNote.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _esc(text: Any) -> str:
    if text is None:
        return ""
    s = str(text)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _patient_table(ticket: QueueTicket) -> Table:
    p = ticket.patient
    rows = [
        ["Patient", p.name, "Ticket", ticket.ticket_number],
        [
            "Age / Sex",
            f"{p.age} y/o · {'Male' if p.sex.value == 'M' else 'Female'}",
            "Department",
            ticket.poli.value.title(),
        ],
        [
            "Identifier",
            p.nik or "—",
            "Payer",
            "Self-pay" if not p.bpjs_number else f"Insurance {p.bpjs_number}",
        ],
        [
            "DOB",
            p.dob.isoformat(),
            "Visit date",
            datetime.now().strftime("%Y-%m-%d"),
        ],
    ]
    t = Table(rows, colWidths=[28 * mm, 60 * mm, 28 * mm, 60 * mm])
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (0, -1), INK_400),
                ("TEXTCOLOR", (2, 0), (2, -1), INK_400),
                ("TEXTCOLOR", (1, 0), (1, -1), INK),
                ("TEXTCOLOR", (3, 0), (3, -1), INK),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.5, INK_100),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, INK_100),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def _vitals_block(v: VitalSigns, styles: dict[str, ParagraphStyle]) -> list:
    rows = [
        [
            "BP", f"{v.systolic_bp or '—'}/{v.diastolic_bp or '—'}",
            "HR", f"{v.heart_rate or '—'}",
            "RR", f"{v.respiratory_rate or '—'}",
        ],
        [
            "Temp °C", f"{v.temperature_c if v.temperature_c is not None else '—'}",
            "SpO₂ %", f"{v.spo2 or '—'}",
            "Pain", f"{v.pain_score if v.pain_score is not None else '—'}/10",
        ],
    ]
    t = Table(rows, colWidths=[16 * mm, 26 * mm, 16 * mm, 26 * mm, 16 * mm, 26 * mm])
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("TEXTCOLOR", (0, 0), (0, -1), INK_400),
                ("TEXTCOLOR", (2, 0), (2, -1), INK_400),
                ("TEXTCOLOR", (4, 0), (4, -1), INK_400),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
                ("FONTNAME", (5, 0), (5, -1), "Helvetica-Bold"),
                ("BOX", (0, 0), (-1, -1), 0.5, INK_100),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, INK_100),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    out: list = [t]
    if v.critical_findings:
        labels = [CRITICAL_LABELS.get(c, c) for c in v.critical_findings]
        out += [
            Spacer(1, 4),
            Paragraph(
                "⚠ " + " · ".join(_esc(l) for l in labels),
                styles["alert"],
            ),
        ]
    return out


def _summary_block(summary: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list:
    out: list = []
    cc = summary.get("chief_complaint")
    if cc:
        out += [Paragraph("<b>Chief complaint:</b> " + _esc(cc), styles["body"])]
    hpi = summary.get("hpi_paragraph")
    if hpi:
        out += [Spacer(1, 4), Paragraph(_esc(hpi), styles["body"])]
    hist = summary.get("relevant_history") or []
    if hist:
        out += [
            Spacer(1, 6),
            Paragraph("<b>Relevant history:</b>", styles["body"]),
        ]
        for h in hist:
            out.append(Paragraph("• " + _esc(h), styles["body"]))
    triage = summary.get("triage_assessment")
    if triage:
        out += [
            Spacer(1, 6),
            Paragraph("<b>Triage:</b> " + _esc(triage), styles["body"]),
        ]
    diffs = summary.get("differentials") or []
    if diffs:
        out += [
            Spacer(1, 6),
            Paragraph("<b>Differentials considered:</b>", styles["body"]),
        ]
        for d in diffs:
            out.append(Paragraph("• " + _esc(d), styles["body"]))
    delta = summary.get("followup_delta") or {}
    if delta:
        out += [
            Spacer(1, 6),
            Paragraph("<b>Follow-up delta</b>", styles["body"]),
            Paragraph(
                "Prior treatment: " + _esc(delta.get("previous_treatment", "—")),
                styles["small"],
            ),
            Paragraph(
                "Adherence: " + _esc(delta.get("adherence", "—")),
                styles["small"],
            ),
            Paragraph(
                "Symptom response: " + _esc(delta.get("symptom_response", "—")),
                styles["small"],
            ),
            Paragraph(
                "Clinician interpretation: "
                + _esc(delta.get("clinical_interpretation", "—")),
                styles["small"],
            ),
        ]
    return out


def _soap_block(note: ConsultationNote, styles: dict[str, ParagraphStyle]) -> list:
    parts = []
    for label, text in (
        ("Subjective", note.subjective),
        ("Objective", note.objective),
        ("Assessment", note.assessment),
        ("Plan", note.plan),
    ):
        if not text:
            continue
        parts.append(Paragraph(f"<b>{label}.</b> {_esc(text)}", styles["body"]))
        parts.append(Spacer(1, 4))
    return parts


def _transcript_excerpt(
    transcript: ConsultationTranscript, styles: dict[str, ParagraphStyle]
) -> list:
    txt = transcript.transcript_text or ""
    if not txt:
        return []
    excerpt = txt if len(txt) <= 1400 else txt[:1380].rstrip() + "…"
    return [Paragraph(_esc(excerpt).replace("\n", "<br/>"), styles["small"])]


async def build_pdf(ticket_id: uuid.UUID) -> tuple[bytes, str]:
    settings = get_settings()
    async with SessionLocal() as db:
        ticket = await _load(db, ticket_id)
        if ticket is None:
            raise ValueError("ticket not found")

        vitals = await _vitals(db, ticket_id)
        transcript = await _latest_transcript(db, ticket_id)
        note = await _latest_note(db, ticket_id)
        prescriptions = await _prescriptions(db, ticket_id)
        summary = (
            ticket.intake_session.summary
            if ticket.intake_session and ticket.intake_session.summary
            else None
        )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=f"Visit chart · {ticket.ticket_number}",
        author=settings.CLINIC_NAME,
    )
    styles = _styles()
    story: list = []

    story.append(Paragraph(settings.CLINIC_NAME, styles["title"]))
    story.append(
        Paragraph(
            f"Visit chart · ticket {ticket.ticket_number} · "
            f"generated {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            styles["subtitle"],
        )
    )
    story.append(HRFlowable(width="100%", thickness=0.6, color=INK_100))
    story.append(Spacer(1, 8))

    story.append(_patient_table(ticket))

    if vitals:
        story.append(Spacer(1, 10))
        story.append(Paragraph("VITALS ON ARRIVAL", styles["h2"]))
        story.extend(_vitals_block(vitals, styles))

    if summary:
        story.append(Spacer(1, 6))
        story.append(Paragraph("PRE-VISIT SUMMARY", styles["h2"]))
        story.extend(_summary_block(summary, styles))

    if note:
        story.append(Spacer(1, 6))
        story.append(Paragraph("CONSULTATION NOTE (SOAP)", styles["h2"]))
        story.extend(_soap_block(note, styles))
        if note.model_used:
            story.append(
                Paragraph(
                    f"<i>Drafted by {_esc(note.model_used)} · physician must "
                    "review and sign before this becomes the medical record.</i>",
                    styles["small"],
                )
            )

    if prescriptions:
        story.append(Spacer(1, 6))
        story.append(Paragraph("PRESCRIPTIONS", styles["h2"]))
        rx_rows = [["Drug", "Dose", "Frequency", "Days", "Status"]]
        for rx in prescriptions:
            rx_rows.append(
                [
                    rx.drug_name,
                    rx.dose,
                    rx.frequency,
                    str(rx.duration_days),
                    "Approved" if rx.approved else "Draft",
                ]
            )
        tbl = Table(
            rx_rows,
            colWidths=[
                52 * mm,
                26 * mm,
                42 * mm,
                14 * mm,
                26 * mm,
            ],
        )
        tbl.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("LEADING", (0, 0), (-1, -1), 12),
                    ("BACKGROUND", (0, 0), (-1, 0), BRAND_50),
                    ("TEXTCOLOR", (0, 0), (-1, 0), BRAND),
                    ("BOX", (0, 0), (-1, -1), 0.5, INK_100),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, INK_100),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(tbl)
        instructions_lines = [rx for rx in prescriptions if rx.instructions]
        for rx in instructions_lines:
            story.append(
                Paragraph(
                    f"<b>{_esc(rx.drug_name)}:</b> {_esc(rx.instructions)}",
                    styles["small"],
                )
            )

    if transcript and transcript.transcript_text:
        story.append(Spacer(1, 6))
        story.append(Paragraph("CONSULTATION TRANSCRIPT (excerpt)", styles["h2"]))
        story.extend(_transcript_excerpt(transcript, styles))

    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.4, color=INK_100))
    story.append(
        Paragraph(
            f"Generated by Patiently · prototype · not a substitute for a "
            f"signed medical record · {settings.CLINIC_NAME}",
            styles["footer"],
        )
    )

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()

    filename = (
        f"visit-{ticket.ticket_number}-"
        f"{datetime.now().strftime('%Y%m%d')}.pdf"
    )
    return pdf_bytes, filename
