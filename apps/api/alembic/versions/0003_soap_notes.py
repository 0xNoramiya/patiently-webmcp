"""add consultation_notes (SOAP drafted by Featherless)

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "consultation_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("queue_tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "drafting", "done", "failed", name="note_status_enum"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("subjective", sa.Text, nullable=True),
        sa.Column("objective", sa.Text, nullable=True),
        sa.Column("assessment", sa.Text, nullable=True),
        sa.Column("plan", sa.Text, nullable=True),
        sa.Column("raw_response", postgresql.JSONB, nullable=True),
        sa.Column("model_used", sa.String(120), nullable=True),
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
        "ix_consultation_notes_ticket_id",
        "consultation_notes",
        ["ticket_id"],
    )


def downgrade() -> None:
    op.drop_table("consultation_notes")
    sa.Enum(name="note_status_enum").drop(op.get_bind(), checkfirst=True)
