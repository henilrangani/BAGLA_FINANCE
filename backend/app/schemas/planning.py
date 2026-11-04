from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from .common import Currency, PositivePaise


class BudgetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: str | None = Field(default=None, max_length=80)
    period: Literal["daily", "weekly", "monthly", "yearly"] = "monthly"
    amount_paise: PositivePaise
    currency: Currency = "INR"
    rollover: bool = False
    alert_threshold_pct: int = Field(default=80, ge=1, le=100)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def dates_ordered(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class BudgetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    amount_paise: PositivePaise | None = None
    rollover: bool | None = None
    alert_threshold_pct: int | None = Field(default=None, ge=1, le=100)
    end_date: date | None = None
    is_archived: bool | None = None


class BudgetResponse(BaseModel):
    id: UUID
    name: str
    category: str | None
    period: str
    amount_paise: int
    currency: str
    rollover: bool
    alert_threshold_pct: int
    start_date: date
    end_date: date | None
    is_archived: bool
    # Derived for the current period in the user's time zone:
    period_start: date
    period_end: date
    rollover_paise: int
    available_paise: int
    spent_paise: int
    remaining_paise: int
    used_pct: int
    alert: Literal["ok", "near_limit", "over_limit"]


class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    target_paise: PositivePaise
    currency: Currency = "INR"
    deadline: date | None = None


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    target_paise: PositivePaise | None = None
    deadline: date | None = None
    is_archived: bool | None = None


class ContributionCreate(BaseModel):
    amount_paise: PositivePaise
    direction: Literal["deposit", "withdrawal"] = "deposit"
    contributed_on: date | None = None
    note: str | None = Field(default=None, max_length=500)


class ContributionResponse(BaseModel):
    id: UUID
    amount_paise: int
    direction: str
    contributed_on: date
    note: str | None

    model_config = {"from_attributes": True}


class GoalResponse(BaseModel):
    id: UUID
    name: str
    target_paise: int
    currency: str
    deadline: date | None
    is_archived: bool
    saved_paise: int
    remaining_paise: int
    progress_pct: int
