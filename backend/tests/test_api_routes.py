import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
import pytest_asyncio
import asyncio

from app.main import app
from app.strategies.schemas import StrategySchema, AdvancedSettings, PriceExecution, TradingStopLoss, UniversalExit, OvernightProtection, MarketplaceSettings

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio
async def test_parse_strategy(client: AsyncClient):
    response = await client.post(
        "/api/strategies/parse",
        json={
            "text": "EMA crossover strategy with 20 and 50 period",
            "name": "Test Strategy Parse"
        }
    )
    assert response.status_code == 200
    strategy_data = response.json()
    assert strategy_data["name"] == "Test Strategy Parse"
    assert strategy_data["fast"] == 20
    assert strategy_data["slow"] == 50
    assert "universal_exit" in strategy_data
    assert "advanced_settings" in strategy_data

@pytest.mark.asyncio
async def test_run_backtest(client: AsyncClient):
    strategy_data = StrategySchema(
        name="Test Backtest Strategy",
        description="A simple test strategy for backtesting",
        fast=10,
        slow=20,
        risk_pct=1.0,
        universal_exit=UniversalExit(description="Exit at EOD", conditions=[]),
        overnight_protection=OvernightProtection(description="Protect trades overnight"),
        advanced_settings=AdvancedSettings(
            price_execution=PriceExecution(),
            trading_stop_loss=TradingStopLoss(),
            tranch_size="100%",
            execute_first="once",
            reactivate_on_exit_after="1 second",
            check_conditions_every="continuously",
            capital_required=100000,
            take_trades="Start condition after exchange open",
            user_needed_capital_to_deploy=50000,
            choose_expiry={"hours": 0, "minutes": 1},
            dont_rollover="1 minute",
        ),
        marketplace_settings=MarketplaceSettings()
    ).model_dump()

    with patch('app.api.routes.get_candles', new_callable=AsyncMock) as mock_get_candles:
        mock_get_candles.return_value = [] # Mock empty candles for simplicity

        response = await client.post(
            "/api/backtests",
            json={
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "limit": 100,
                "strategy": strategy_data
            }
        )

    assert response.status_code == 200
    backtest_result = response.json()
    assert backtest_result["strategy"]["name"] == "Test Backtest Strategy"
    assert "result" in backtest_result
