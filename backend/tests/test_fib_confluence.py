import pytest
from app.engine.fib_confluence import calculate_fibonacci_pivots, evaluate_confluence

@pytest.fixture
def sample_daily_data():
    return {
        "high": 105.0,
        "low": 95.0,
        "close": 102.0
    }

@pytest.fixture
def sample_fib_pivots():
    return {
        'pivot': 100.6667,
        'r1': 104.4867,
        'r2': 106.8467,
        'r3': 110.6667,
        's1': 96.8467,
        's2': 94.4867,
        's3': 90.6667,
    }

def test_calculate_fibonacci_pivots_basic(sample_daily_data):
    pivots = calculate_fibonacci_pivots(**sample_daily_data)
    assert pivots['pivot'] == pytest.approx((105 + 95 + 102) / 3, 0.0001)
    assert pivots['r1'] == pytest.approx(pivots['pivot'] + 0.382 * (105 - 95), 0.0001)
    assert pivots['s3'] == pytest.approx(pivots['pivot'] - 1.000 * (105 - 95), 0.0001)
    assert isinstance(pivots, dict)
    assert all(isinstance(v, float) for v in pivots.values())

def test_calculate_fibonacci_pivots_edge_cases():
    # High, Low, Close are equal
    pivots = calculate_fibonacci_pivots(high=100.0, low=100.0, close=100.0)
    assert pivots['pivot'] == 100.0
    assert pivots['r1'] == 100.0
    assert pivots['s1'] == 100.0

    # Zero values
    pivots = calculate_fibonacci_pivots(high=0.0, low=0.0, close=0.0)
    assert all(v == 0.0 for v in pivots.values())

def test_calculate_fibonacci_pivots_invalid_input():
    with pytest.raises(ValueError, match="High, Low, and Close must be numeric values."):
        calculate_fibonacci_pivots(high="invalid", low=90.0, close=95.0)
    with pytest.raises(ValueError, match="Low price cannot be greater than High price."):
        calculate_fibonacci_pivots(high=90.0, low=100.0, close=95.0)

def test_evaluate_confluence_basic(sample_fib_pivots):
    current_price = 101.0
    atr_value = 1.0
    result = evaluate_confluence(current_price, sample_fib_pivots, atr_value)

    assert isinstance(result, dict)
    assert 'confluence_score' in result
    assert 'nearest_barrier' in result
    assert 'min_distance_to_barrier' in result
    assert 'entry_rejection_reason' in result

    # Test proximity to pivot
    assert result['nearest_barrier']['name'] == 'pivot'
    assert result['min_distance_to_barrier'] == pytest.approx(abs(current_price - sample_fib_pivots['pivot']), 0.0001)
    assert result['confluence_score'] > 0
    assert result['entry_rejection_reason'] is None 

def test_evaluate_confluence_near_strong_barrier(sample_fib_pivots):
    # Test near R2 (strong barrier)
    current_price = 106.0  # Close to R2 (106.8467)
    atr_value = 1.0
    result = evaluate_confluence(current_price, sample_fib_pivots, atr_value)
    assert result['nearest_barrier']['name'] == 'r2'
    assert result['entry_rejection_reason'] is not None
    assert "Entry rejected" in result['entry_rejection_reason']

    # Test near S3 (strong barrier)
    current_price = 91.0 # Close to S3 (90.6667)
    atr_value = 0.5
    result = evaluate_confluence(current_price, sample_fib_pivots, atr_value)
    assert result['nearest_barrier']['name'] == 's3'
    assert result['entry_rejection_reason'] is not None
    assert "Entry rejected" in result['entry_rejection_reason']

def test_evaluate_confluence_far_from_barriers(sample_fib_pivots):
    current_price = 1000.0 # Far away
    atr_value = 1.0
    result = evaluate_confluence(current_price, sample_fib_pivots, atr_value)
    assert result['confluence_score'] == 0
    assert result['nearest_barrier']['name'] == 'r3'
    assert result['entry_rejection_reason'] is None

    current_price = 10.0 # Far away
    atr_value = 1.0
    result = evaluate_confluence(current_price, sample_fib_pivots, atr_value)
    assert result['nearest_barrier']['name'] == 's3'
    assert result['entry_rejection_reason'] is None

def test_evaluate_confluence_invalid_input():
    fib_pivots = {
        'pivot': 100.0, 'r1': 101.0, 'r2': 102.0, 'r3': 103.0,
        's1': 99.0, 's2': 98.0, 's3': 97.0,
    }
    with pytest.raises(ValueError, match="Current price and ATR value must be numeric."):
        evaluate_confluence(current_price="invalid", fib_pivots=fib_pivots, atr_value=1.0)
    with pytest.raises(ValueError, match="Fibonacci pivots must be a dictionary of numeric values."):
        evaluate_confluence(current_price=100.0, fib_pivots={"pivot": "invalid"}, atr_value=1.0)
    with pytest.raises(ValueError, match="ATR value must be positive for meaningful threshold calculation."):
        evaluate_confluence(current_price=100.0, fib_pivots=fib_pivots, atr_value=0.0)
    with pytest.raises(ValueError, match="ATR value must be positive for meaningful threshold calculation."):
        evaluate_confluence(current_price=100.0, fib_pivots=fib_pivots, atr_value=-1.0)
