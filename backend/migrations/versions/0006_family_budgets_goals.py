"""Family Space: shared budgets, goals and goal contributions.

Additive only: three new tables. Downgrade drops them (their data is lost on downgrade).
"""
import sqlalchemy as sa
from alembic import op

revision = "0006_family_budgets_goals"
down_revision = "0005_split_personal_mirror"
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def _ts():
    return [sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now())]


def upgrade():
    op.create_table(
        "family_budgets",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("family_id", sa.UUID(), sa.ForeignKey("family_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("limit_paise", sa.BigInteger(), nullable=False),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
        sa.CheckConstraint("limit_paise > 0", name="ck_family_budget_limit"),
    )
    op.create_index("ix_family_budgets_family_id", "family_budgets", ["family_id"])
    op.create_table(
        "family_goals",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("family_id", sa.UUID(), sa.ForeignKey("family_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("target_paise", sa.BigInteger(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *_ts(),
        sa.CheckConstraint("target_paise > 0", name="ck_family_goal_target"),
        sa.CheckConstraint("status IN ('active', 'completed', 'archived')", name="ck_family_goal_status"),
    )
    op.create_index("ix_family_goals_family_id", "family_goals", ["family_id"])
    op.create_table(
        "family_goal_contributions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("goal_id", sa.UUID(), sa.ForeignKey("family_goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("contributed_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="recorded"),
        sa.Column("idempotency_key", sa.String(120), nullable=True),
        *_ts(),
        sa.CheckConstraint("amount_paise > 0", name="ck_family_contribution_amount"),
        sa.CheckConstraint("status IN ('recorded', 'void')", name="ck_family_contribution_status"),
        sa.UniqueConstraint("goal_id", "idempotency_key", name="uq_family_contribution_idem"),
    )
    op.create_index("ix_family_goal_contributions_goal_id", "family_goal_contributions", ["goal_id"])
    op.create_index("ix_family_goal_contributions_user_id", "family_goal_contributions", ["user_id"])


def downgrade():
    for t in ("family_goal_contributions", "family_goals", "family_budgets"):
        op.drop_table(t)
