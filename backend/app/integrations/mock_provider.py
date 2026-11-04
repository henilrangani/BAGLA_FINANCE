from .base import FinancialDataProvider


class MockFinancialDataProvider(FinancialDataProvider):
    """Local-only provider for development/testing. Never represents a real bank API."""
    async def fetch_transactions(self, external_account_id: str, cursor: str | None = None):
        return {"transactions": [], "next_cursor": None}
