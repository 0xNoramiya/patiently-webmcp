"""add reminders + transcripts

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "appointment_reminders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "visit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("visits.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("appointment_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False, server_default="sms"),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "sent", "cancelled", "error",
                name="reminder_status_enum",
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("model_used", sa.String(120), nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_appointment_reminders_patient_id",
        "appointment_reminders",
        ["patient_id"],
    )
    op.create_index(
        "ix_appointment_reminders_scheduled_for",
        "appointment_reminders",
        ["scheduled_for"],
    )
    op.create_index(
        "ix_appointment_reminders_status", "appointment_reminders", ["status"]
    )

    op.create_table(
        "consultation_transcripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("queue_tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("audio_path", sa.String(255), nullable=False),
        sa.Column("speechmatics_job_id", sa.String(120), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "transcribing", "done", "failed",
                name="transcript_status_enum",
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("transcript_text", sa.Text, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_consultation_transcripts_ticket_id",
        "consultation_transcripts",
        ["ticket_id"],
    )


def downgrade() -> None:
    op.drop_table("consultation_transcripts")
    op.drop_table("appointment_reminders")
    sa.Enum(name="transcript_status_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="reminder_status_enum").drop(op.get_bind(), checkfirst=True)
