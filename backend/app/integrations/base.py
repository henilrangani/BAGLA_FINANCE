from abc import ABC, abstractmethod
from typing import Any


class FinancialDataProvider(ABC):
    @abstractmethod
    async def fetch_transactions(self, external_account_id: str, cursor: str | None = None) -> dict[str, Any]: ...
