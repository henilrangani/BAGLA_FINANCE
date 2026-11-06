"""Scheduled job run log (monitoring). Additive: one table; downgrade drops it."""
import sqlalchemy as sa
from alembic import op

revision = "0009_job_runs"
down_revision = "0008_notifications"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "job_runs",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("job", sa.String(60), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="running"),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.CheckConstraint("status IN ('running', 'ok', 'error', 'skipped')", name="ck_job_run_status"),
    )
    op.create_index("ix_job_runs_job_started", "job_runs", ["job", "started_at"])


def downgrade():
    op.drop_table("job_runs")
