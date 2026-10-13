import pytest
from app.engine.indicators import bollinger_bands, fibonacci_pivots

def test_bollinger_bands():
    values = [10.0] * 30
    bb = bollinger_bands(values, period=20, num_std=2.0)
    assert len(bb['middle']) == 30
    assert bb['middle'][-1] == 10.0
    assert bb['upper'][-1] == 10.0
    assert bb['lower'][-1] == 10.0

def test_fibonacci_pivots():
    pivots = fibonacci_pivots(high=150.0, low=100.0, close=120.0)
    # Pivot = (150 + 100 + 120) / 3 = 123.3333
    # Range = 50.0
    # R1 = 123.3333 + 0.382 * 50 = 142.4333
    # S1 = 123.3333 - 0.382 * 50 = 104.2333
    assert round(pivots['pivot'], 2) == 123.33
    assert round(pivots['r1'], 2) == 142.43
    assert round(pivots['s1'], 2) == 104.23
