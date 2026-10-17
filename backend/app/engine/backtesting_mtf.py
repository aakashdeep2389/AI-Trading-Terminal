from __future__ import annotations
import math
import statistics
from typing import List, Dict, Any, Optional
from app.market.models import Candle
from app.engine.indicators import bollinger_bands, atr
from app.engine.bollinger_mtf import (
    check_sell_alert,
    check_sell_breakdown,
    check_buy_alert,
    check_buy_confirmation,
    calculate_risk_reward
)
from app.engine.fib_confluence import calculate_fibonacci_pivots, evaluate_confluence

def backtest_mtf(
    candles_5m: List[Candle],
    candles_15m: List[Candle],
    daily_candles: Optional[List[Candle]] = None,
    config: Optional[Dict[str, Any]] = None,
    initial_capital: float = 100000.0
) -> Dict[str, Any]:
    """
    Multi-Timeframe Backtest Engine for Bollinger Bands & Fibonacci Pivots strategy.
    """
    if not candles_5m or len(candles_5m) < 30:
        return {
            "total_return": 0.0, "win_rate": 0.0, "profit_factor": 0.0,
            "sharpe": 0.0, "sortino": 0.0, "max_drawdown": 0.0,
            "average_trade": 0.0, "trade_count": 0, "equity_curve": [initial_capital],
            "trades": []
        }

    cfg = config or {}
    bb_period = int(cfg.get("bb_period", 20))
    bb_std = float(cfg.get("bb_std", 1.4))
    risk_pct = float(cfg.get("risk_pct", 1.0))
    min_confluence_score = int(cfg.get("min_confluence_score", 0))

    closes_5m = [c.close for c in candles_5m]
    bb_5m = bollinger_bands(closes_5m, period=bb_period, num_std=bb_std)
    highs_5m = [c.high for c in candles_5m]
    lows_5m = [c.low for c in candles_5m]
    atr_5m = atr(highs_5m, lows_5m, closes_5m, 14)

    bb_15m = None
    if candles_15m and len(candles_15m) >= bb_period:
        closes_15m = [c.close for c in candles_15m]
        bb_15m = bollinger_bands(closes_15m, period=bb_period, num_std=bb_std)

    fib_pivots = None
    if daily_candles and len(daily_candles) > 0:
        last_daily = daily_candles[-1]
        fib_pivots = calculate_fibonacci_pivots(last_daily.high, last_daily.low, last_daily.close)

    equity = initial_capital
    equity_curve = [initial_capital]
    trades = []

    pending_sell_alert = None
    pending_buy_15m_alert = None
    confirmed_buy_setup = None
    next_free_index = bb_period

    for i in range(bb_period, len(candles_5m) - 1):
        if i < next_free_index:
            equity_curve.append(equity)
            continue

        c = candles_5m[i]
        c_next = candles_5m[i + 1]

        # 1. Sell Setup (5m)
        if bb_5m["upper"][i] is not None:
            upper_band = bb_5m["upper"][i]
            if check_sell_alert(c, upper_band):
                pending_sell_alert = {"high": c.high, "low": c.low, "index": i}
            elif pending_sell_alert is not None:
                if check_sell_breakdown(c, pending_sell_alert["low"]):
                    entry_price = c_next.open
                    rr_calc = calculate_risk_reward(entry_price, pending_sell_alert["high"], "short")

                    confluence_ok = True
                    if fib_pivots and atr_5m[i]:
                        conf = evaluate_confluence(entry_price, fib_pivots, atr_5m[i])
                        if conf["confluence_score"] < min_confluence_score or conf["entry_rejection_reason"]:
                            confluence_ok = False

                    if rr_calc["valid"] and confluence_ok:
                        stop_loss = rr_calc["stop_loss"]
                        take_profit = rr_calc["take_profit"]

                        exit_price = c_next.close
                        exit_reason = "end_of_data"
                        exit_idx = len(candles_5m) - 1

                        for j in range(i + 1, len(candles_5m)):
                            cj = candles_5m[j]
                            hit_sl = cj.high >= stop_loss
                            hit_tp = cj.low <= take_profit

                            if hit_sl and hit_tp:
                                exit_price = stop_loss
                                exit_reason = "stop_loss"
                                exit_idx = j
                                break
                            elif hit_sl:
                                exit_price = stop_loss
                                exit_reason = "stop_loss"
                                exit_idx = j
                                break
                            elif hit_tp:
                                exit_price = take_profit
                                exit_reason = "target"
                                exit_idx = j
                                break

                        pnl_pct = (entry_price - exit_price) / entry_price
                        pos_size = equity * (risk_pct / 100.0) / max((stop_loss - entry_price) / entry_price, 1e-6)
                        pnl = pos_size * pnl_pct
                        equity += pnl

                        trades.append({
                            "side": "short", "entry": entry_price, "exit": exit_price,
                            "stop_loss": stop_loss, "target": take_profit, "pnl": pnl,
                            "return_pct": pnl_pct * 100, "exit_reason": exit_reason,
                            "entry_index": i + 1, "exit_index": exit_idx
                        })

                        next_free_index = exit_idx + 1
                        pending_sell_alert = None
                        equity_curve.extend([equity] * (exit_idx - i))
                        continue

        # 2. Buy Setup (15m Signal -> 5m Entry)
        if bb_15m and len(candles_15m) > 0:
            current_time = c.time
            eligible_15m = [c15 for c15 in candles_15m if c15.time <= current_time]
            if len(eligible_15m) >= bb_period + 1:
                idx_15m = len(eligible_15m) - 1
                c15_prev = eligible_15m[idx_15m - 1]
                c15_curr = eligible_15m[idx_15m]
                lower_bb_15m = bb_15m["lower"][idx_15m - 1]

                if lower_bb_15m is not None:
                    if check_buy_alert(c15_prev, lower_bb_15m):
                        pending_buy_15m_alert = {"high": c15_prev.high, "low": c15_prev.low}

                    if pending_buy_15m_alert and check_buy_confirmation(c15_curr, pending_buy_15m_alert["high"]):
                        confirmed_buy_setup = {"alert_high": pending_buy_15m_alert["high"], "alert_low": pending_buy_15m_alert["low"]}
                        pending_buy_15m_alert = None

        if confirmed_buy_setup and c.high > confirmed_buy_setup["alert_high"]:
            entry_price = c_next.open
            rr_calc = calculate_risk_reward(entry_price, confirmed_buy_setup["alert_low"], "long")

            confluence_ok = True
            if fib_pivots and atr_5m[i]:
                conf = evaluate_confluence(entry_price, fib_pivots, atr_5m[i])
                if conf["confluence_score"] < min_confluence_score or conf["entry_rejection_reason"]:
                    confluence_ok = False

            if rr_calc["valid"] and confluence_ok:
                stop_loss = rr_calc["stop_loss"]
                take_profit = rr_calc["take_profit"]

                exit_price = c_next.close
                exit_reason = "end_of_data"
                exit_idx = len(candles_5m) - 1

                for j in range(i + 1, len(candles_5m)):
                    cj = candles_5m[j]
                    hit_sl = cj.low <= stop_loss
                    hit_tp = cj.high >= take_profit

                    if hit_sl and hit_tp:
                        exit_price = stop_loss
                        exit_reason = "stop_loss"
                        exit_idx = j
                        break
                    elif hit_sl:
                        exit_price = stop_loss
                        exit_reason = "stop_loss"
                        exit_idx = j
                        break
                    elif hit_tp:
                        exit_price = take_profit
                        exit_reason = "target"
                        exit_idx = j
                        break

                pnl_pct = (exit_price - entry_price) / entry_price
                pos_size = equity * (risk_pct / 100.0) / max((entry_price - stop_loss) / entry_price, 1e-6)
                pnl = pos_size * pnl_pct
                equity += pnl

                trades.append({
                    "side": "long", "entry": entry_price, "exit": exit_price,
                    "stop_loss": stop_loss, "target": take_profit, "pnl": pnl,
                    "return_pct": pnl_pct * 100, "exit_reason": exit_reason,
                    "entry_index": i + 1, "exit_index": exit_idx
                })

                next_free_index = exit_idx + 1
                confirmed_buy_setup = None
                equity_curve.extend([equity] * (exit_idx - i))
                continue

        equity_curve.append(equity)

    returns = [t["pnl"] / initial_capital for t in trades]
    wins = [r for r in returns if r > 0]
    losses = [r for r in returns if r < 0]

    win_rate = (len(wins) / len(returns) * 100.0) if returns else 0.0
    profit_factor = (sum(wins) / abs(sum(losses))) if losses else (1e9 if wins else 0.0)

    avg_ret = sum(returns) / len(returns) if returns else 0.0
    std_ret = statistics.pstdev(returns) if len(returns) > 1 else 0.0
    sharpe = (avg_ret / std_ret * math.sqrt(len(returns))) if std_ret > 0 else 0.0

    peak = initial_capital
    max_dd = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        max_dd = min(max_dd, (value - peak) / peak)

    return {
        "total_return": ((equity / initial_capital) - 1.0) * 100.0,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "sharpe": sharpe,
        "sortino": 0.0,
        "max_drawdown": abs(max_dd) * 100.0,
        "average_trade": avg_ret * 100.0,
        "trade_count": len(trades),
        "equity_curve": equity_curve,
        "trades": trades
    }
