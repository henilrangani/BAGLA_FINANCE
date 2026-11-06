"""Reminder preferences and notification outbox.

Additive only: two new tables. Downgrade drops them.
"""
import sqlalchemy as sa
from alembic import op

revision = "0008_notifications"
down_revision = "0007_group_share_ledger"
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def _ts():
    return [sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now())]


def upgrade():
    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bill_reminders", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("quiet_start", sa.Time(), nullable=True),
        sa.Column("quiet_end", sa.Time(), nullable=True),
        *_ts(),
        sa.UniqueConstraint("user_id", name="uq_notification_pref_user"),
    )
    op.create_index("ix_notification_preferences_user_id", "notification_preferences", ["user_id"])
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False, server_default="in_app"),
        sa.Column("dedupe_key", sa.String(160), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.String(500), nullable=False),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", TS, nullable=False),
        sa.Column("delivered_at", TS, nullable=True),
        sa.Column("read_at", TS, nullable=True),
        sa.Column("last_error", sa.String(300), nullable=True),
        *_ts(),
        sa.UniqueConstraint("user_id", "channel", "dedupe_key", name="uq_notification_dedupe"),
        sa.CheckConstraint("channel IN ('in_app', 'email')", name="ck_notification_channel"),
        sa.CheckConstraint("status IN ('pending', 'delivered', 'failed', 'skipped')", name="ck_notification_status"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_pending", "notifications", ["status", "next_attempt_at"])


def downgrade():
    op.drop_table("notifications")
    op.drop_table("notification_preferences")
