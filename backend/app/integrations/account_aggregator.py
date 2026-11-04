from .base import FinancialDataProvider


class AccountAggregatorProvider(FinancialDataProvider):
    """Integration boundary. Real provider credentials/onboarding are required for production."""
    async def fetch_transactions(self, external_account_id: str, cursor: str | None = None):
        raise NotImplementedError("Configure an authorized production/sandbox provider before use")
