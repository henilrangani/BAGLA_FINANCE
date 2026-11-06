"""Group type/label and per-expense split method and weights. Additive; downgrade drops the columns."""
import sqlalchemy as sa
from alembic import op

revision = "0010_group_types_split_methods"
down_revision = "0009_job_runs"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("split_groups") as b:
        b.add_column(sa.Column("group_type", sa.String(20), nullable=False, server_default="custom"))
        b.add_column(sa.Column("group_label", sa.String(40), nullable=True))
    with op.batch_alter_table("split_expenses") as b:
        b.add_column(sa.Column("split_method", sa.String(16), nullable=True))
        b.add_column(sa.Column("split_weights", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("split_expenses") as b:
        b.drop_column("split_weights")
        b.drop_column("split_method")
    with op.batch_alter_table("split_groups") as b:
        b.drop_column("group_label")
        b.drop_column("group_type")
