from app.market.models import Candle
from typing import Dict, Any

def check_sell_alert(candle: Candle, upper_bb: float) -> bool:
    """
    Returns True if the entire high-low range of the candle is strictly below
    the upper Bollinger Band (High < upper_bb).
    """
    return candle.high < upper_bb

def check_sell_breakdown(candle: Candle, alert_low: float) -> bool:
    """
    Returns True if the candle's low is strictly below the alert candle's low.
    """
    return candle.low < alert_low

def check_buy_alert(candle: Candle, lower_bb: float) -> bool:
    """
    Returns True if the entire high-low range of the candle is strictly above
    the lower Bollinger Band (Low > lower_bb).
    """
    return candle.low > lower_bb

def check_buy_confirmation(candle: Candle, alert_high: float) -> bool:
    """
    Returns True if the candle's high is strictly above the alert candle's high.
    """
    return candle.high > alert_high

def calculate_risk_reward(entry: float, alert_price: float, side: str, buffer: float = 0.0) -> Dict[str, Any]:
    """
    Calculates SL and TP based on a 1:3 risk-reward ratio.

    Long: SL = alert_price - buffer; TP = entry + 3 * (entry - SL).
    Short: SL = alert_price + buffer; TP = entry - 3 * (SL - entry).
    """
    side = side.lower()
    if side == "long":
        sl = alert_price - buffer
        risk = entry - sl
        if risk <= 0:
            return {
                "valid": False,
                "stop_loss": sl,
                "take_profit": 0.0,
                "risk": risk,
                "rr_ratio": 3.0,
                "reason": "Stop loss must be below entry for long trades"
            }
        tp = entry + 3 * risk
    elif side == "short":
        sl = alert_price + buffer
        risk = sl - entry
        if risk <= 0:
            return {
                "valid": False,
                "stop_loss": sl,
                "take_profit": 0.0,
                "risk": risk,
                "rr_ratio": 3.0,
                "reason": "Stop loss must be above entry for short trades"
            }
        tp = entry - 3 * risk
    else:
        return {
            "valid": False,
            "stop_loss": 0.0,
            "take_profit": 0.0,
            "risk": 0.0,
            "rr_ratio": 3.0,
            "reason": f"Invalid side: {side}"
        }

    return {
        "valid": True,
        "stop_loss": sl,
        "take_profit": tp,
        "risk": risk,
        "rr_ratio": 3.0,
        "reason": "Valid risk-reward calculation"
    }
