"""Ledger, sessions, audit, budgets and goals.

Data-preserving upgrade from 0001:
- financial_accounts.balance_paise is renamed to opening_balance_paise
  (balances are now derived from ledger entries).
- Unknown account types become 'other'.
- transactions.direction is kept; kind is derived (credit -> income,
  debit -> expense). deleted=true becomes status='void'.
- external_id 'idem:<key>' values become idempotency_key; any other
  external_id is kept as source_ref.
- Transactions with no account are attached to a per-user
  "Unassigned (migrated)" account instead of being dropped.
- occurred_at = created_at; local_date is computed in Asia/Kolkata.

PostgreSQL only (uses gen_random_uuid(), PG13+).
Downgrade restores the 0001 shape; data in tables created here is lost on downgrade.
"""
import sqlalchemy as sa
from alembic import op

revision = "0002_ledger_auth_planning"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None

ACCOUNT_TYPES = "('bank','cash','savings','credit_card','wallet','loan','investment','other')"
KINDS = ("('income','expense','transfer','refund','reversal','savings_contribution','loan_repayment',"
         "'investment','adjustment')")
SOURCES = "('manual','voice','receipt','import','notification_observed','aggregator','ai_suggested','migration')"
TS = sa.DateTime(timezone=True)


def upgrade():
    # ---- users
    op.add_column("users", sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Kolkata"))
    op.add_column("users", sa.Column("locale", sa.String(8), nullable=False, server_default="en"))
    op.add_column("users", sa.Column("default_currency", sa.String(3), nullable=False, server_default="INR"))
    op.add_column("users", sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until", TS, nullable=True))
    op.alter_column("users", "created_at", server_default=sa.func.now())
    op.alter_column("users", "updated_at", server_default=sa.func.now())

    # ---- sessions
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("revoked_at", TS, nullable=True),
        sa.Column("replaced_by_id", sa.UUID(), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_refresh_token_hash", "auth_sessions", ["refresh_token_hash"])

    # ---- accounts
    op.alter_column("financial_accounts", "balance_paise", new_column_name="opening_balance_paise")
    op.add_column("financial_accounts", sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE financial_accounts SET account_type = lower(trim(account_type))")
    op.execute(f"UPDATE financial_accounts SET account_type = 'other' WHERE account_type NOT IN {ACCOUNT_TYPES}")
    op.create_check_constraint("ck_account_type", "financial_accounts", f"account_type IN {ACCOUNT_TYPES}")
    op.alter_column("financial_accounts", "created_at", server_default=sa.func.now())
    op.alter_column("financial_accounts", "updated_at", server_default=sa.func.now())

    # ---- transactions: new columns (nullable first, backfill, then tighten)
    for col in (
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("kind", sa.String(32), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="posted"),
        sa.Column("merchant", sa.String(160), nullable=True),
        sa.Column("notes", sa.String(1000), nullable=True),
        sa.Column("occurred_at", TS, nullable=True),
        sa.Column("local_date", sa.Date(), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("source_ref", sa.String(255), nullable=True),
        sa.Column("idempotency_key", sa.String(255), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("transfer_group_id", sa.UUID(), nullable=True),
        sa.Column("refund_of_id", sa.UUID(), nullable=True),
        sa.Column("reverses_id", sa.UUID(), nullable=True),
    ):
        op.add_column("transactions", col)

    op.execute("UPDATE transactions SET direction = lower(trim(direction))")
    op.execute("UPDATE transactions SET kind = CASE WHEN direction = 'credit' THEN 'income' ELSE 'expense' END")
    op.execute("UPDATE transactions SET direction = 'debit' WHERE direction NOT IN ('debit','credit')")
    op.execute("UPDATE transactions SET status = CASE WHEN deleted THEN 'void' ELSE 'posted' END")
    op.execute("UPDATE transactions SET occurred_at = created_at")
    op.execute("UPDATE transactions SET local_date = (created_at AT TIME ZONE 'Asia/Kolkata')::date")
    op.execute("UPDATE transactions SET idempotency_key = substr(external_id, 6) WHERE external_id LIKE 'idem:%'")
    op.execute("UPDATE transactions SET source_ref = external_id "
               "WHERE external_id IS NOT NULL AND external_id NOT LIKE 'idem:%'")
    op.execute(f"UPDATE transactions SET source = 'migration' WHERE source NOT IN {SOURCES}")
    op.execute("UPDATE transactions t SET currency = a.currency FROM financial_accounts a WHERE a.id = t.account_id")
    # Attach account-less rows to a per-user placeholder account (never drop financial history).
    op.execute(
        "INSERT INTO financial_accounts (id, user_id, name, account_type, opening_balance_paise, currency, "
        "is_archived, created_at, updated_at) "
        "SELECT gen_random_uuid(), u.user_id, 'Unassigned (migrated)', 'other', 0, 'INR', false, now(), now() "
        "FROM (SELECT DISTINCT user_id FROM transactions WHERE account_id IS NULL) u"
    )
    op.execute(
        "UPDATE transactions t SET account_id = a.id FROM financial_accounts a "
        "WHERE t.account_id IS NULL AND a.user_id = t.user_id AND a.name = 'Unassigned (migrated)'"
    )

    op.alter_column("transactions", "kind", nullable=False)
    op.alter_column("transactions", "occurred_at", nullable=False, server_default=sa.func.now())
    op.alter_column("transactions", "local_date", nullable=False)
    op.alter_column("transactions", "account_id", nullable=False)
    op.alter_column("transactions", "created_at", server_default=sa.func.now())
    op.alter_column("transactions", "updated_at", server_default=sa.func.now())
    op.drop_constraint("transactions_account_id_fkey", "transactions", type_="foreignkey")
    op.create_foreign_key("transactions_account_id_fkey", "transactions", "financial_accounts",
                          ["account_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_tx_refund_of", "transactions", "transactions", ["refund_of_id"], ["id"],
                          ondelete="RESTRICT")
    op.create_foreign_key("fk_tx_reverses", "transactions", "transactions", ["reverses_id"], ["id"],
                          ondelete="RESTRICT")
    op.create_check_constraint("ck_tx_amount_positive", "transactions", "amount_paise > 0")
    op.create_check_constraint("ck_tx_direction", "transactions", "direction IN ('debit','credit')")
    op.create_check_constraint("ck_tx_kind", "transactions", f"kind IN {KINDS}")
    op.create_check_constraint("ck_tx_status", "transactions", "status IN ('pending','posted','void')")
    op.create_check_constraint("ck_tx_source", "transactions", f"source IN {SOURCES}")
    op.create_unique_constraint("uq_tx_user_idempotency", "transactions", ["user_id", "idempotency_key"])
    op.create_unique_constraint("uq_tx_reverses_id", "transactions", ["reverses_id"])
    op.create_index("ix_tx_user_local_date", "transactions", ["user_id", "local_date"])
    op.create_index("ix_transactions_transfer_group_id", "transactions", ["transfer_group_id"])
    op.create_index("ix_transactions_refund_of_id", "transactions", ["refund_of_id"])
    op.drop_index("ix_transactions_external_id", table_name="transactions")
    op.drop_column("transactions", "external_id")
    op.drop_column("transactions", "deleted")

    # ---- audit
    op.create_table(
        "audit_events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("entity_type", sa.String(40), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=True),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_events_user_id", "audit_events", ["user_id"])
    op.create_index("ix_audit_entity", "audit_events", ["entity_type", "entity_id"])
    # Record that existing rows were migrated.
    op.execute(
        "INSERT INTO audit_events (id, user_id, actor_user_id, entity_type, entity_id, action, created_at) "
        "SELECT gen_random_uuid(), user_id, NULL, 'transaction', id, 'migrated_0002', now() FROM transactions"
    )

    # ---- budgets & goals
    op.create_table(
        "budgets",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("period", sa.String(16), nullable=False, server_default="monthly"),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("rollover", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("alert_threshold_pct", sa.BigInteger(), nullable=False, server_default="80"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("amount_paise > 0", name="ck_budget_amount_positive"),
        sa.CheckConstraint("period IN ('daily', 'weekly', 'monthly', 'yearly')", name="ck_budget_period"),
    )
    op.create_index("ix_budgets_user_id", "budgets", ["user_id"])
    op.create_table(
        "savings_goals",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("target_paise", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("target_paise > 0", name="ck_goal_target_positive"),
    )
    op.create_index("ix_savings_goals_user_id", "savings_goals", ["user_id"])
    op.create_table(
        "goal_contributions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("goal_id", sa.UUID(), sa.ForeignKey("savings_goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False, server_default="deposit"),
        sa.Column("contributed_on", sa.Date(), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("transaction_id", sa.UUID(), sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("amount_paise > 0", name="ck_contrib_amount_positive"),
        sa.CheckConstraint("direction IN ('deposit', 'withdrawal')", name="ck_contrib_direction"),
    )
    op.create_index("ix_goal_contributions_goal_id", "goal_contributions", ["goal_id"])
    op.create_index("ix_goal_contributions_user_id", "goal_contributions", ["user_id"])


def downgrade():
    op.drop_table("goal_contributions")
    op.drop_table("savings_goals")
    op.drop_table("budgets")
    op.drop_table("audit_events")

    op.add_column("transactions", sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("transactions", sa.Column("external_id", sa.String(255), nullable=True))
    op.execute("UPDATE transactions SET deleted = (status = 'void')")
    op.execute("UPDATE transactions SET external_id = CASE WHEN idempotency_key IS NOT NULL "
               "THEN 'idem:' || idempotency_key ELSE source_ref END")
    op.create_index("ix_transactions_external_id", "transactions", ["external_id"])
    op.drop_index("ix_transactions_refund_of_id", table_name="transactions")
    op.drop_index("ix_transactions_transfer_group_id", table_name="transactions")
    op.drop_index("ix_tx_user_local_date", table_name="transactions")
    op.drop_constraint("uq_tx_reverses_id", "transactions", type_="unique")
    op.drop_constraint("uq_tx_user_idempotency", "transactions", type_="unique")
    for ck in ("ck_tx_source", "ck_tx_status", "ck_tx_kind", "ck_tx_direction", "ck_tx_amount_positive"):
        op.drop_constraint(ck, "transactions", type_="check")
    op.drop_constraint("fk_tx_reverses", "transactions", type_="foreignkey")
    op.drop_constraint("fk_tx_refund_of", "transactions", type_="foreignkey")
    op.drop_constraint("transactions_account_id_fkey", "transactions", type_="foreignkey")
    op.create_foreign_key("transactions_account_id_fkey", "transactions", "financial_accounts",
                          ["account_id"], ["id"], ondelete="SET NULL")
    op.alter_column("transactions", "account_id", nullable=True)
    for col in ("reverses_id", "refund_of_id", "transfer_group_id", "needs_review", "idempotency_key",
                "source_ref", "timezone", "local_date", "occurred_at", "notes", "merchant", "status",
                "kind", "currency"):
        op.drop_column("transactions", col)

    op.drop_constraint("ck_account_type", "financial_accounts", type_="check")
    op.drop_column("financial_accounts", "is_archived")
    op.alter_column("financial_accounts", "opening_balance_paise", new_column_name="balance_paise")

    op.drop_index("ix_auth_sessions_refresh_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    for col in ("locked_until", "failed_login_count", "default_currency", "locale", "timezone"):
        op.drop_column("users", col)
