from __future__ import annotations
import math

def calculate_fibonacci_pivots(high: float, low: float, close: float) -> dict[str, float]:
    """
    Calculate Fibonacci Pivot Points for a given daily high, low, and close.

    Formulae:
    Pivot Point (P) = (High + Low + Close) / 3
    Resistance 1 (R1) = P + (0.382 * Range)
    Resistance 2 (R2) = P + (0.618 * Range)
    Resistance 3 (R3) = P + (1.000 * Range)
    Support 1 (S1) = P - (0.382 * Range)
    Support 2 (S2) = P - (0.618 * Range)
    Support 3 (S3) = P - (1.000 * Range)
    Where Range = High - Low

    Args:
        high (float): The daily high price.
        low (float): The daily low price.
        close (float): The daily closing price.

    Returns:
        dict[str, float]: A dictionary containing the pivot point and resistance/support levels.
    """
    if not all(isinstance(arg, (int, float)) for arg in [high, low, close]):
        raise ValueError("High, Low, and Close must be numeric values.")
    if low > high:
        raise ValueError("Low price cannot be greater than High price.")

    pivot = (high + low + close) / 3.0
    rng = high - low

    return {
        'pivot': round(pivot, 4),
        'r1': round(pivot + 0.382 * rng, 4),
        'r2': round(pivot + 0.618 * rng, 4),
        'r3': round(pivot + 1.000 * rng, 4),
        's1': round(pivot - 0.382 * rng, 4),
        's2': round(pivot - 0.618 * rng, 4),
        's3': round(pivot - 1.000 * rng, 4),
    }


def evaluate_confluence(current_price: float, fib_pivots: dict[str, float], atr_value: float) -> dict:
    """
    Evaluate price confluence with Fibonacci Pivot levels.
    The confluence score is based on proximity to pivot levels within a defined ATR-based threshold.
    It also suggests potential entry rejection if current price is too close to a strong barrier,
    indicating poor risk/reward.

    Args:
        current_price (float): The current market price.
        fib_pivots (dict[str, float]): Dictionary of Fibonacci pivot levels (P, R1-R3, S1-S3).
        atr_value (float): The current Average True Range (ATR) value, used for dynamic thresholds.

    Returns:
        dict: A dictionary containing confluence score, nearest barrier, distance, and entry rejection advice.
    """
    if not all(isinstance(arg, (int, float)) for arg in [current_price, atr_value]):
        raise ValueError("Current price and ATR value must be numeric.")
    if not isinstance(fib_pivots, dict) or not all(isinstance(v, (int, float)) for v in fib_pivots.values()):
        raise ValueError("Fibonacci pivots must be a dictionary of numeric values.")
    if atr_value <= 0:
        raise ValueError("ATR value must be positive for meaningful threshold calculation.")

    # Define proximity thresholds as multiples of ATR
    proximity_threshold_1 = 0.5 * atr_value # Closer range
    proximity_threshold_2 = 1.0 * atr_value # Mid range
    proximity_threshold_3 = 1.5 * atr_value # Wider range

    confluence_score = 0
    nearest_barrier = None
    min_distance = float('inf')
    
    # Sort pivots for easier processing
    sorted_pivots = sorted(fib_pivots.items(), key=lambda item: item[1])
    
    for name, level in sorted_pivots:
        distance = abs(current_price - level)
        if distance < min_distance:
            min_distance = distance
            nearest_barrier = {'name': name, 'level': level}

        # Score based on proximity, stronger levels get higher scores
        if 'r3' in name or 's3' in name:
            if distance <= proximity_threshold_1: confluence_score += 10
            elif distance <= proximity_threshold_2: confluence_score += 7
            elif distance <= proximity_threshold_3: confluence_score += 3
        elif 'r2' in name or 's2' in name:
            if distance <= proximity_threshold_1: confluence_score += 8
            elif distance <= proximity_threshold_2: confluence_score += 5
            elif distance <= proximity_threshold_3: confluence_score += 2
        elif 'r1' in name or 's1' in name:
            if distance <= proximity_threshold_1: confluence_score += 6
            elif distance <= proximity_threshold_2: confluence_score += 3
            elif distance <= proximity_threshold_3: confluence_score += 1
        elif 'pivot' in name: # Central pivot point
            if distance <= proximity_threshold_1: confluence_score += 7
            elif distance <= proximity_threshold_2: confluence_score += 4
            elif distance <= proximity_threshold_3: confluence_score += 2

    # Entry rejection logic based on proximity to nearest strong barrier (R2, R3, S2, S3)
    entry_rejection_reason = None
    if nearest_barrier:
        barrier_name = nearest_barrier['name']
        barrier_level = nearest_barrier['level']
        
        # Consider R2, R3, S2, S3 as strong barriers
        is_strong_barrier = 'r2' in barrier_name or 'r3' in barrier_name or 's2' in barrier_name or 's3' in barrier_name
        
        # If current price is within 1 ATR of a strong barrier, suggest rejection
        if is_strong_barrier and min_distance <= 1.0 * atr_value:
            entry_rejection_reason = (
                f"Entry rejected: Current price ({current_price:.2f}) is too close "
                f"to a strong Fibonacci barrier ({barrier_name}: {barrier_level:.2f}), "
                "indicating poor risk/reward for immediate entry."
            )

    return {
        'confluence_score': confluence_score,
        'nearest_barrier': nearest_barrier,
        'min_distance_to_barrier': round(min_distance, 4),
        'entry_rejection_reason': entry_rejection_reason,
    }
