import pytest
from app.strategies.bollinger_bands import BollingerBandsStrategy, Candle

def test_bollinger_bands_sell_flow():
    strategy = BollingerBandsStrategy()
    symbol = "BTCUSDT"

    # Create dummy candles with some variation
    candles = []
    base_time = 1700000000
    for i in range(25):
        # vary closes around 100 with larger range
        candles.append(Candle(time=base_time + i * 300, open=100.0, high=120.0, low=80.0, close=100.0 + ((i % 5) * 10)))

    # Candle 25: Alert candle (high < upper band)
    # With variation, upper band should be > 105. High = 104.0, Low = 96.0
    candles.append(Candle(time=base_time + 25 * 300, open=100.0, high=104.0, low=96.0, close=100.0))

    # Process 5m candles to trigger alert
    signal = strategy.process_5m_candles(symbol, candles)
    assert signal is None
    assert symbol in strategy.sell_alerts

    # Candle 26: Confirmation candle (breaks below alert low 96.0)
    candles.append(Candle(time=base_time + 26 * 300, open=95.0, high=95.0, low=94.0, close=94.5))

    signal = strategy.process_5m_candles(symbol, candles)
    assert signal is not None
    assert signal["direction"] == "SELL"
    assert signal["symbol"] == symbol
    assert symbol not in strategy.sell_alerts

def test_bollinger_bands_touch_invalid():
    strategy = BollingerBandsStrategy()
    symbol = "BTCUSDT"

    candles = []
    base_time = 1700000000
    for i in range(25):
        candles.append(Candle(time=base_time + i * 300, open=90.0, high=92.0, low=88.0, close=90.0))

    # Candle 25: High touches upper band (e.g., upper band is ~95, high = 95.5) -> Invalid sell alert
    candles.append(Candle(time=base_time + 25 * 300, open=92.0, high=96.0, low=91.0, close=93.0))

    strategy.process_5m_candles(symbol, candles)
    assert symbol not in strategy.sell_alerts
