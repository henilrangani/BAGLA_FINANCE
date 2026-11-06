"""Share-based group accounting: "group" account type and per-member ledger links.

Additive: widens the account-type check and adds one table. Downgrade drops the table and
restores the old check (fails if any "group" accounts exist, so no data is silently lost).
"""
import sqlalchemy as sa
from alembic import op

revision = "0007_group_share_ledger"
down_revision = "0006_family_budgets_goals"
branch_labels = None
depends_on = None

OLD = ("bank", "cash", "savings", "credit_card", "wallet", "loan", "investment", "other")
NEW = OLD + ("group",)


def _check(types):
    return "account_type IN (" + ", ".join(f"'{t}'" for t in types) + ")"


def upgrade():
    with op.batch_alter_table("financial_accounts") as b:
        b.drop_constraint("ck_account_type", type_="check")
        b.create_check_constraint("ck_account_type", _check(NEW))
    op.create_table(
        "split_ledger_links",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("group_id", sa.UUID(), sa.ForeignKey("split_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", sa.UUID(), sa.ForeignKey("split_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_account_id", sa.UUID(), sa.ForeignKey("financial_accounts.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("funding_account_id", sa.UUID(), sa.ForeignKey("financial_accounts.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("group_id", "user_id", name="uq_split_ledger_link"),
    )
    op.create_index("ix_split_ledger_links_group_id", "split_ledger_links", ["group_id"])
    op.create_index("ix_split_ledger_links_user_id", "split_ledger_links", ["user_id"])


def downgrade():
    op.drop_table("split_ledger_links")
    with op.batch_alter_table("financial_accounts") as b:
        b.drop_constraint("ck_account_type", type_="check")
        b.create_check_constraint("ck_account_type", _check(OLD))
