"""Server-backed group splitting and recurring bills.

Additive only: new tables. No existing data is changed.
Downgrade drops these tables (their data is lost on downgrade).
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_splits_recurring"
down_revision = "0003_imports_family_business"
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def _ts():
    return [sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now())]


def upgrade():
    op.create_table(
        "split_groups",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("cover_emoji", sa.String(16), nullable=False, server_default="👥"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("budget_paise", sa.BigInteger(), nullable=True),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
    )
    op.create_table(
        "split_members",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("group_id", sa.UUID(), sa.ForeignKey("split_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("upi_id", sa.String(320), nullable=True),
        sa.Column("role", sa.String(16), nullable=False, server_default="member"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("invite_token_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("invite_expires_at", sa.Date(), nullable=True),
        *_ts(),
        sa.CheckConstraint("role IN ('admin', 'member')", name="ck_split_member_role"),
        sa.CheckConstraint("status IN ('active', 'removed')", name="ck_split_member_status"),
    )
    op.create_index("ix_split_members_group_id", "split_members", ["group_id"])
    op.create_index("ix_split_members_user_id", "split_members", ["user_id"])
    op.create_table(
        "split_expenses",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("group_id", sa.UUID(), sa.ForeignKey("split_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(300), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("paid_by_member_id", sa.UUID(), sa.ForeignKey("split_members.id", ondelete="RESTRICT"),
                  nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="posted"),
        sa.Column("created_by_user", sa.UUID(), nullable=True),
        sa.Column("idempotency_key", sa.String(120), nullable=True),
        *_ts(),
        sa.CheckConstraint("amount_paise > 0", name="ck_split_expense_amount"),
        sa.CheckConstraint("status IN ('posted', 'void')", name="ck_split_expense_status"),
        sa.UniqueConstraint("group_id", "idempotency_key", name="uq_split_expense_idem"),
    )
    op.create_index("ix_split_expenses_group_id", "split_expenses", ["group_id"])
    op.create_table(
        "split_shares",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("expense_id", sa.UUID(), sa.ForeignKey("split_expenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", sa.UUID(), sa.ForeignKey("split_members.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("share_paise", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("share_paise >= 0", name="ck_split_share_nonneg"),
        sa.UniqueConstraint("expense_id", "member_id", name="uq_split_share"),
    )
    op.create_index("ix_split_shares_expense_id", "split_shares", ["expense_id"])
    op.create_table(
        "split_settlements",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("group_id", sa.UUID(), sa.ForeignKey("split_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_member_id", sa.UUID(), sa.ForeignKey("split_members.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("to_member_id", sa.UUID(), sa.ForeignKey("split_members.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("method", sa.String(24), nullable=False, server_default="upi"),
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="recorded"),
        sa.Column("created_by_user", sa.UUID(), nullable=True),
        sa.Column("idempotency_key", sa.String(120), nullable=True),
        *_ts(),
        sa.CheckConstraint("amount_paise > 0", name="ck_split_settlement_amount"),
        sa.CheckConstraint("status IN ('recorded', 'void')", name="ck_split_settlement_status"),
        sa.CheckConstraint("from_member_id <> to_member_id", name="ck_split_settlement_distinct"),
        sa.UniqueConstraint("group_id", "idempotency_key", name="uq_split_settlement_idem"),
    )
    op.create_index("ix_split_settlements_group_id", "split_settlements", ["group_id"])
    op.create_table(
        "recurring_bills",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("account_id", sa.UUID(), sa.ForeignKey("financial_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("frequency", sa.String(16), nullable=False, server_default="monthly"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("remind_days_before", sa.Integer(), nullable=False, server_default="3"),
        *_ts(),
        sa.CheckConstraint("amount_paise > 0", name="ck_recurring_amount"),
        sa.CheckConstraint("frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')",
                           name="ck_recurring_freq"),
        sa.CheckConstraint("status IN ('active', 'paused', 'cancelled')", name="ck_recurring_status"),
        sa.CheckConstraint("remind_days_before BETWEEN 0 AND 30", name="ck_recurring_remind"),
    )
    op.create_index("ix_recurring_bills_user_id", "recurring_bills", ["user_id"])
    op.create_table(
        "recurring_occurrences",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("bill_id", sa.UUID(), sa.ForeignKey("recurring_bills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("transaction_id", sa.UUID(), sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        *_ts(),
        sa.UniqueConstraint("bill_id", "due_date", name="uq_recurring_occurrence"),
        sa.CheckConstraint("status IN ('paid', 'skipped')", name="ck_occurrence_status"),
    )
    op.create_index("ix_recurring_occurrences_bill_id", "recurring_occurrences", ["bill_id"])


def downgrade():
    for t in ("recurring_occurrences", "recurring_bills", "split_settlements", "split_shares", "split_expenses",
              "split_members", "split_groups"):
        op.drop_table(t)
