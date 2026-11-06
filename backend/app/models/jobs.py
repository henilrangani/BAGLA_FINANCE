"""Record of scheduled job runs (monitoring: GET /health/jobs)."""
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, UTCDateTime, UUIDMixin


class JobRun(Base, UUIDMixin):
    __tablename__ = "job_runs"
    __table_args__ = (
        CheckConstraint("status IN ('running', 'ok', 'error', 'skipped')", name="ck_job_run_status"),
        Index("ix_job_runs_job_started", "job", "started_at"),
    )

    job: Mapped[str] = mapped_column(String(60))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="running")
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
