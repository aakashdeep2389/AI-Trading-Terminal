import pytest
from app.market.models import Candle
from app.engine.bollinger_mtf import (
    check_sell_alert,
    check_sell_breakdown,
    check_buy_alert,
    check_buy_confirmation,
    calculate_risk_reward
)

def test_sell_alert_strictly_below_upper_bb():
    # Case 1: High is strictly below Upper BB -> True
    candle_below = Candle(time=100, open=10.0, high=10.5, low=9.5, close=10.2)
    assert check_sell_alert(candle_below, 11.0) is True

    # Case 2: High touches Upper BB -> False
    candle_touch = Candle(time=101, open=10.0, high=11.0, low=9.5, close=10.2)
    assert check_sell_alert(candle_touch, 11.0) is False

    # Case 3: High breaches Upper BB -> False
    candle_above = Candle(time=102, open=10.0, high=11.5, low=9.5, close=10.2)
    assert check_sell_alert(candle_above, 11.0) is False

def test_sell_breakdown_confirmation():
    # Case 1: Low is strictly below Alert Low -> True
    candle_break = Candle(time=100, open=10.0, high=10.5, low=9.0, close=9.2)
    assert check_sell_breakdown(candle_break, 9.5) is True

    # Case 2: Low touches Alert Low -> False
    candle_touch = Candle(time=101, open=10.0, high=10.5, low=9.5, close=9.6)
    assert check_sell_breakdown(candle_touch, 9.5) is False

    # Case 3: Low is above Alert Low -> False
    candle_above = Candle(time=102, open=10.0, high=10.5, low=9.8, close=10.0)
    assert check_sell_breakdown(candle_above, 9.5) is False

def test_buy_alert_strictly_above_lower_bb():
    # Case 1: Low is strictly above Lower BB -> True
    candle_above = Candle(time=100, open=10.0, high=11.0, low=9.5, close=10.2)
    assert check_buy_alert(candle_above, 9.0) is True

    # Case 2: Low touches Lower BB -> False
    candle_touch = Candle(time=101, open=10.0, high=11.0, low=9.0, close=10.2)
    assert check_buy_alert(candle_touch, 9.0) is False

    # Case 3: Low breaches Lower BB -> False
    candle_below = Candle(time=102, open=10.0, high=11.0, low=8.5, close=10.2)
    assert check_buy_alert(candle_below, 9.0) is False

def test_buy_confirmation():
    # Case 1: High is strictly above Alert High -> True
    candle_conf = Candle(time=100, open=10.0, high=11.5, low=9.5, close=11.0)
    assert check_buy_confirmation(candle_conf, 11.0) is True

    # Case 2: High touches Alert High -> False
    candle_touch = Candle(time=101, open=10.0, high=11.0, low=9.5, close=10.8)
    assert check_buy_confirmation(candle_touch, 11.0) is False

    # Case 3: High is below Alert High -> False
    candle_below = Candle(time=102, open=10.0, high=10.8, low=9.5, close=10.5)
    assert check_buy_confirmation(candle_below, 11.0) is False

def test_calculate_risk_reward_strict_1_to_3():
    # Long: Entry=100, AlertPrice=90, Buffer=0
    # SL = 90, Risk = 10, TP = 100 + 3*10 = 130
    res_long = calculate_risk_reward(100.0, 90.0, "long")
    assert res_long["valid"] is True
    assert res_long["stop_loss"] == 90.0
    assert res_long["take_profit"] == 130.0
    assert res_long["risk"] == 10.0
    assert res_long["rr_ratio"] == 3.0

    # Long with buffer: Entry=100, AlertPrice=90, Buffer=2
    # SL = 88, Risk = 12, TP = 100 + 3*12 = 136
    res_long_buf = calculate_risk_reward(100.0, 90.0, "long", buffer=2.0)
    assert res_long_buf["valid"] is True
    assert res_long_buf["stop_loss"] == 88.0
    assert res_long_buf["take_profit"] == 136.0
    assert res_long_buf["risk"] == 12.0

    # Short: Entry=100, AlertPrice=110, Buffer=0
    # SL = 110, Risk = 10, TP = 100 - 3*10 = 70
    res_short = calculate_risk_reward(100.0, 110.0, "short")
    assert res_short["valid"] is True
    assert res_short["stop_loss"] == 110.0
    assert res_short["take_profit"] == 70.0
    assert res_short["risk"] == 10.0
    assert res_short["rr_ratio"] == 3.0

    # Short with buffer: Entry=100, AlertPrice=110, Buffer=2
    # SL = 112, Risk = 12, TP = 100 - 3*12 = 64
    res_short_buf = calculate_risk_reward(100.0, 110.0, "short", buffer=2.0)
    assert res_short_buf["valid"] is True
    assert res_short_buf["stop_loss"] == 112.0
    assert res_short_buf["take_profit"] == 64.0
    assert res_short_buf["risk"] == 12.0

    # Invalid Long: SL above entry
    res_inv_long = calculate_risk_reward(100.0, 105.0, "long")
    assert res_inv_long["valid"] is False
    assert "Stop loss must be below entry" in res_inv_long["reason"]

    # Invalid Short: SL below entry
    res_inv_short = calculate_risk_reward(100.0, 95.0, "short")
    assert res_inv_short["valid"] is False
    assert "Stop loss must be above entry" in res_inv_short["reason"]

    # Invalid Risk: SL == Entry
    res_zero_risk = calculate_risk_reward(100.0, 100.0, "long")
    assert res_zero_risk["valid"] is False
    assert res_zero_risk["risk"] == 0.0
