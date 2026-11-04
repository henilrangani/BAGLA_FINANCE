"""Statement imports, family sharing, support, feedback and Bagla subscriptions.

Additive only: new tables plus nullable columns. No existing data is changed.
Downgrade drops the new tables (their data is lost on downgrade).
"""
import sqlalchemy as sa
from alembic import op

revision = "0003_imports_family_business"
down_revision = "0002_ledger_auth_planning"
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def _ts():
    return [sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now())]


def upgrade():
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        "family_groups",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *_ts(),
    )
    op.create_table(
        "family_members",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("family_id", sa.UUID(), sa.ForeignKey("family_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        *_ts(),
        sa.UniqueConstraint("family_id", "user_id", name="uq_family_member"),
        sa.CheckConstraint("role IN ('admin', 'adult', 'child', 'viewer')", name="ck_family_role"),
        sa.CheckConstraint("status IN ('active', 'removed')", name="ck_family_member_status"),
    )
    op.create_index("ix_family_members_family_id", "family_members", ["family_id"])
    op.create_index("ix_family_members_user_id", "family_members", ["user_id"])
    op.create_table(
        "family_invites",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("family_id", sa.UUID(), sa.ForeignKey("family_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("accepted_by", sa.UUID(), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
        sa.CheckConstraint("role IN ('admin', 'adult', 'child', 'viewer')", name="ck_invite_role"),
    )
    op.create_index("ix_family_invites_family_id", "family_invites", ["family_id"])

    op.add_column("transactions", sa.Column("shared_family_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_tx_shared_family", "transactions", "family_groups", ["shared_family_id"], ["id"],
                          ondelete="SET NULL")
    op.create_index("ix_transactions_shared_family_id", "transactions", ["shared_family_id"])
    op.add_column("transactions", sa.Column("import_batch_id", sa.UUID(), nullable=True))
    op.create_index("ix_transactions_import_batch_id", "transactions", ["import_batch_id"])

    op.create_table(
        "import_batches",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.UUID(), sa.ForeignKey("financial_accounts.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_sha256", sa.String(64), nullable=False),
        sa.Column("file_format", sa.String(8), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="preview"),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duplicate_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("imported_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("column_map", sa.JSON(), nullable=True),
        *_ts(),
        sa.CheckConstraint("status IN ('preview', 'committed', 'cancelled')", name="ck_import_status"),
    )
    op.create_index("ix_import_batches_user_id", "import_batches", ["user_id"])
    op.create_index("ix_import_batches_file_sha256", "import_batches", ["file_sha256"])
    op.create_table(
        "import_rows",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("batch_id", sa.UUID(), sa.ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=True),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("amount_paise", sa.BigInteger(), nullable=True),
        sa.Column("direction", sa.String(10), nullable=True),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("dedupe_key", sa.String(255), nullable=True),
        sa.Column("duplicate_of_id", sa.UUID(), nullable=True),
        sa.Column("error", sa.String(300), nullable=True),
        sa.Column("transaction_id", sa.UUID(), nullable=True),
    )
    op.create_index("ix_import_rows_batch_id", "import_rows", ["batch_id"])

    op.create_table(
        "support_tickets",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reference", sa.String(16), nullable=False, unique=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("priority", sa.String(16), nullable=False, server_default="normal"),
        sa.Column("subject", sa.String(160), nullable=False),
        sa.Column("message", sa.String(4000), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("staff_note", sa.String(2000), nullable=True),
        *_ts(),
        sa.CheckConstraint("status IN ('open', 'in_progress', 'resolved', 'closed')", name="ck_ticket_status"),
        sa.CheckConstraint("priority IN ('low', 'normal', 'high', 'urgent')", name="ck_ticket_priority"),
    )
    op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
    op.create_table(
        "feedback",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("message", sa.String(2000), nullable=True),
        sa.Column("context", sa.String(80), nullable=True),
        *_ts(),
        sa.CheckConstraint("rating IS NULL OR (rating BETWEEN 1 AND 5)", name="ck_feedback_rating"),
    )

    op.create_table(
        "plans",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("code", sa.String(40), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("price_paise", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("billing_interval", sa.String(8), nullable=False, server_default="month"),
        sa.Column("trial_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("features", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts(),
        sa.CheckConstraint("billing_interval IN ('month', 'year')", name="ck_plan_interval"),
    )
    op.create_table(
        "user_subscriptions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("plan_code", sa.String(40), sa.ForeignKey("plans.code"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("trial_ends_at", TS, nullable=True),
        sa.Column("current_period_end", TS, nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("canceled_at", TS, nullable=True),
        sa.Column("trial_used", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts(),
        sa.CheckConstraint("status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')",
                           name="ck_sub_status"),
    )
    op.create_table(
        "billing_events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("plan_code", sa.String(40), nullable=True),
        sa.Column("amount_paise", sa.BigInteger(), nullable=True),
        sa.Column("provider", sa.String(40), nullable=True),
        sa.Column("provider_ref", sa.String(120), nullable=True, unique=True),
        sa.Column("details", sa.JSON(), nullable=True),
        *_ts(),
    )
    op.create_index("ix_billing_events_user_id", "billing_events", ["user_id"])


def downgrade():
    for t in ("billing_events", "user_subscriptions", "plans", "feedback", "support_tickets", "import_rows",
              "import_batches"):
        op.drop_table(t)
    op.drop_index("ix_transactions_import_batch_id", table_name="transactions")
    op.drop_column("transactions", "import_batch_id")
    op.drop_index("ix_transactions_shared_family_id", table_name="transactions")
    op.drop_constraint("fk_tx_shared_family", "transactions", type_="foreignkey")
    op.drop_column("transactions", "shared_family_id")
    for t in ("family_invites", "family_members", "family_groups"):
        op.drop_table(t)
    op.drop_column("users", "is_admin")
