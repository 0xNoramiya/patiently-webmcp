"""add prescription_drafts

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prescription_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("queue_tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("drug_name", sa.String(255), nullable=False),
        sa.Column("dose", sa.String(64), nullable=False),
        sa.Column("frequency", sa.String(64), nullable=False),
        sa.Column("duration_days", sa.Integer, nullable=False),
        sa.Column("instructions", sa.Text, nullable=True),
        sa.Column("rationale", sa.Text, nullable=True),
        sa.Column(
            "source", sa.String(40), nullable=False, server_default="featherless"
        ),
        sa.Column(
            "approved", sa.Boolean, nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_prescription_drafts_ticket_id",
        "prescription_drafts",
        ["ticket_id"],
    )


def downgrade() -> None:
    op.drop_table("prescription_drafts")
