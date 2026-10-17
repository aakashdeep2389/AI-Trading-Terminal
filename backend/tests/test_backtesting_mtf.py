import pytest
import math
from datetime import datetime, timezone
from app.market.models import Candle
from app.engine.backtesting_mtf import backtest_mtf

def generate_candles(count: int, interval_seconds: int, base_price: float = 100.0) -> list[Candle]:
    candles = []
    start_time = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp())
    price = base_price
    for i in range(count):
        t = start_time + (i * interval_seconds)
        drift = math.sin(i / 5.0) * 2.0
        close_p = price + drift
        high_p = max(price, close_p) + 0.5
        low_p = min(price, close_p) - 0.5
        candles.append(Candle(
            time=t, open=price, high=high_p, low=low_p, close=close_p, volume=100.0
        ))
        price = close_p
    return candles

def test_backtest_mtf_execution():
    candles_5m = generate_candles(100, 300, 100.0)
    candles_15m = generate_candles(35, 900, 100.0)
    daily = [Candle(time=int(datetime(2025, 12, 31, tzinfo=timezone.utc).timestamp()), open=98.0, high=105.0, low=95.0, close=100.0, volume=1000.0)]

    result = backtest_mtf(candles_5m, candles_15m, daily_candles=daily, config={"bb_period": 10, "bb_std": 1.0, "risk_pct": 1.0})

    assert isinstance(result, dict)
    assert "total_return" in result
    assert "win_rate" in result
    assert "profit_factor" in result
    assert "trade_count" in result
    assert "equity_curve" in result
    assert "trades" in result
    assert len(result["equity_curve"]) > 0
