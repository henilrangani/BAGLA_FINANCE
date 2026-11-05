from fastapi import APIRouter

from .routes import (
    accounts,
    auth,
    business,
    family,
    family_finance,
    imports,
    planning,
    recurring,
    reports,
    splits,
    transactions,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(imports.router, prefix="/imports", tags=["imports"])
api_router.include_router(planning.budgets, prefix="/budgets", tags=["budgets"])
api_router.include_router(planning.goals, prefix="/goals", tags=["goals"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(family.router, prefix="/families", tags=["family"])
api_router.include_router(family_finance.router, prefix="/families", tags=["family"])
api_router.include_router(business.support, prefix="/support", tags=["support"])
api_router.include_router(business.feedback, prefix="/feedback", tags=["feedback"])
api_router.include_router(business.billing, prefix="/billing", tags=["billing"])
api_router.include_router(business.admin, prefix="/admin", tags=["admin"])
api_router.include_router(splits.router, prefix="/groups", tags=["groups"])
api_router.include_router(recurring.router, prefix="/recurring", tags=["recurring"])
