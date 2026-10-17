import pytest
import pytest_asyncio
from app.engine.paper_engine import engine

def test_paper_engine_status_and_config():
    status = engine.get_status()
    assert "is_running" in status
    assert "daily_trades_today" in status
    assert "max_daily_trades" in status
    assert status["max_daily_trades"] == 3

    engine.start()
    assert engine.get_status()["is_running"] is True

    engine.update_config("XAUUSD", "15m", {"risk_pct": 1.5})
    updated_status = engine.get_status()
    assert updated_status["active_symbol"] == "XAUUSD"
    assert updated_status["active_timeframe"] == "15m"

    engine.stop()
    assert engine.get_status()["is_running"] is False
