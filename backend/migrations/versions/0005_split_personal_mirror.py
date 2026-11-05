"""Group integrity: link a group expense to the payer's personal ledger entry, and add
a version counter to groups for optimistic concurrency.

Additive: one nullable column and one integer column (default 0). Downgrade drops both
(the link is lost; the expense and ledger rows stay).
"""
import sqlalchemy as sa
from alembic import op

revision = "0005_split_personal_mirror"
down_revision = "0004_splits_recurring"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("split_groups") as b:
        b.add_column(sa.Column("version", sa.Integer(), nullable=False, server_default="0"))
    with op.batch_alter_table("split_expenses") as b:
        b.add_column(sa.Column("personal_transaction_id", sa.UUID(), nullable=True))
        b.create_foreign_key("fk_split_expense_personal_tx", "transactions", ["personal_transaction_id"], ["id"],
                             ondelete="SET NULL")


def downgrade():
    with op.batch_alter_table("split_expenses") as b:
        b.drop_constraint("fk_split_expense_personal_tx", type_="foreignkey")
        b.drop_column("personal_transaction_id")
    with op.batch_alter_table("split_groups") as b:
        b.drop_column("version")
