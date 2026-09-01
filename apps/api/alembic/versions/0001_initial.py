"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "patients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("nik", sa.String(16), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("dob", sa.Date, nullable=False),
        sa.Column(
            "sex",
            sa.Enum("M", "F", name="sex_enum"),
            nullable=False,
        ),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("bpjs_number", sa.String(32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_patients_nik", "patients", ["nik"])

    op.create_table(
        "visits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("visit_date", sa.Date, nullable=False),
        sa.Column(
            "poli",
            sa.Enum("umum", "anak", "kia", "gigi", "lansia", name="poli_enum"),
            nullable=False,
        ),
        sa.Column("chief_complaint", sa.Text, nullable=False),
        sa.Column("diagnosis_icd10", sa.String(16), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("prescriber_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_visits_patient_id", "visits", ["patient_id"])
    op.create_index("ix_visits_visit_date", "visits", ["visit_date"])

    op.create_table(
        "prescriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "visit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("visits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("drug_name", sa.String(255), nullable=False),
        sa.Column("dose", sa.String(64), nullable=False),
        sa.Column("frequency", sa.String(64), nullable=False),
        sa.Column("duration_days", sa.Integer, nullable=False),
        sa.Column("instructions", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_prescriptions_visit_id", "prescriptions", ["visit_id"])

    op.create_table(
        "queue_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_number", sa.String(16), nullable=False),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "poli",
            sa.Enum(
                "umum", "anak", "kia", "gigi", "lansia",
                name="poli_enum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "payer",
            sa.Enum("bpjs", "umum", name="payer_enum"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "waiting",
                "in_intake",
                "intake_complete",
                "in_consultation",
                "done",
                "cancelled",
                name="ticket_status_enum",
            ),
            nullable=False,
            server_default="waiting",
        ),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "is_followup", sa.Boolean, nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("called_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_queue_tickets_ticket_number", "queue_tickets", ["ticket_number"])
    op.create_index("ix_queue_tickets_patient_id", "queue_tickets", ["patient_id"])
    op.create_index("ix_queue_tickets_poli", "queue_tickets", ["poli"])
    op.create_index("ix_queue_tickets_status", "queue_tickets", ["status"])

    op.create_table(
        "intake_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("queue_tickets.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "active", "completed", "abandoned", name="intake_status_enum"
            ),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "structured_data",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "triage_flags",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("summary", postgresql.JSONB, nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "intake_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("intake_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.Enum("agent", "patient", "system", name="message_role_enum"),
            nullable=False,
        ),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("extracted_fields", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_intake_messages_session_id", "intake_messages", ["session_id"]
    )


def downgrade() -> None:
    op.drop_table("intake_messages")
    op.drop_table("intake_sessions")
    op.drop_table("queue_tickets")
    op.drop_table("prescriptions")
    op.drop_table("visits")
    op.drop_table("patients")
    sa.Enum(name="message_role_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="intake_status_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="ticket_status_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="payer_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="poli_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="sex_enum").drop(op.get_bind(), checkfirst=True)
