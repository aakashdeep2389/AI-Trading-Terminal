from __future__ import annotations
from dataclasses import dataclass
import math, statistics
from .indicators import atr, ema, rsi as calculate_rsi, bollinger_bands, fibonacci_pivots

@dataclass
class BacktestResult:
    total_return: float; win_rate: float; profit_factor: float; sharpe: float; sortino: float; max_drawdown: float; average_trade: float; trade_count: int; equity_curve: list; trades: list

def backtest(candles, strategy, initial_capital=10000.0):
    """Deterministic, no-lookahead EMA backtest. A signal at i enters no earlier than i+1."""
    fast, slow = int(strategy.get('fast', 20)), int(strategy.get('slow', 50))
    risk_pct, stop_mult = float(strategy.get('risk_pct', 1)), float(strategy.get('stop_atr_multiple', 2))
    target_rr = float(strategy.get('target_risk_reward', 2))
    rsi_buy_below = strategy.get('rsi_buy_below')
    price_above_ema = strategy.get('price_above_ema')
    closes, highs, lows = [c.close for c in candles], [c.high for c in candles], [c.low for c in candles]
    ef, es, atr_values = ema(closes, fast), ema(closes, slow), atr(highs, lows, closes, 14)

    # Precompute RSI if needed for entry filters
    rsi_values = None
    if rsi_buy_below is not None:
        rsi_values = calculate_rsi(closes, 14)

    # Precompute EMA for price_above_ema filter if needed
    ema_for_filter = None
    if price_above_ema is not None:
        ema_for_filter = ema(closes, price_above_ema)

    # Parse custom indicators
    custom_indicators = strategy.get('custom_indicators') or []
    bb_config = None
    fib_config = None
    for ind in custom_indicators:
        itype = getattr(ind, 'type', None) or (ind.get('type') if isinstance(ind, dict) else None)
        iparams = getattr(ind, 'params', None) or (ind.get('params') if isinstance(ind, dict) else {})
        if itype == 'bollinger_bands':
            bb_config = iparams or {}
        elif itype == 'fibonacci_pivots':
            fib_config = iparams or {}

    bb_bands = None
    if bb_config is not None:
        bb_period = int(bb_config.get('period', 20))
        bb_num_std = float(bb_config.get('num_std', 2.0))
        bb_bands = bollinger_bands(closes, period=bb_period, num_std=bb_num_std)

    equity, curve, trades, next_free = initial_capital, [initial_capital], [], max(fast, slow)
    for signal_index in range(max(fast, slow), len(candles) - 1):
        if signal_index < next_free or None in (ef[signal_index], es[signal_index], ef[signal_index - 1], es[signal_index - 1], atr_values[signal_index]):
            curve.append(equity); continue
        side = 1 if ef[signal_index] > es[signal_index] and ef[signal_index - 1] <= es[signal_index - 1] else -1 if ef[signal_index] < es[signal_index] and ef[signal_index - 1] >= es[signal_index - 1] else 0
        if not side: curve.append(equity); continue

        # Apply custom indicators filters
        if bb_config is not None and bb_bands is not None:
            if bb_bands['lower'][signal_index] is None or bb_bands['upper'][signal_index] is None:
                curve.append(equity)
                continue
            bb_sig = bb_config.get('signal', 'bounce_lower')
            if side == 1:
                if bb_sig == 'bounce_lower':
                    touched_lower = (lows[signal_index] <= bb_bands['lower'][signal_index] or
                                     (signal_index > 0 and lows[signal_index - 1] <= bb_bands['lower'][signal_index - 1]))
                    if not touched_lower and closes[signal_index] > bb_bands['middle'][signal_index]:
                        curve.append(equity)
                        continue
                elif bb_sig == 'below_middle':
                    if closes[signal_index] > bb_bands['middle'][signal_index]:
                        curve.append(equity)
                        continue
            elif side == -1:
                if bb_sig == 'bounce_upper':
                    touched_upper = (highs[signal_index] >= bb_bands['upper'][signal_index] or
                                     (signal_index > 0 and highs[signal_index - 1] >= bb_bands['upper'][signal_index - 1]))
                    if not touched_upper and closes[signal_index] < bb_bands['middle'][signal_index]:
                        curve.append(equity)
                        continue

        if fib_config is not None:
            lookback = int(fib_config.get('lookback', 20))
            fib_sig = fib_config.get('signal', 'above_pivot')
            window_candles = candles[max(0, signal_index - lookback):signal_index]
            if len(window_candles) > 0:
                h = max(c.high for c in window_candles)
                l = min(c.low for c in window_candles)
                c_prev = window_candles[-1].close
                pivots = fibonacci_pivots(h, l, c_prev)
                if side == 1:
                    if fib_sig == 'above_pivot' and closes[signal_index] < pivots['pivot']:
                        curve.append(equity)
                        continue
                    elif fib_sig == 'near_support' and closes[signal_index] < pivots['s1']:
                        curve.append(equity)
                        continue
                elif side == -1:
                    if fib_sig == 'below_pivot' and closes[signal_index] > pivots['pivot']:
                        curve.append(equity)
                        continue

        # Apply additional entry filters if specified
        if side == 1:  # Long entry
            if rsi_buy_below is not None and rsi_values is not None:
                if rsi_values[signal_index] is not None and rsi_values[signal_index] >= rsi_buy_below:
                    curve.append(equity)
                    continue
            if price_above_ema is not None and ema_for_filter is not None:
                if ema_for_filter[signal_index] is not None and closes[signal_index] <= ema_for_filter[signal_index]:
                    curve.append(equity)
                    continue
        elif side == -1:  # Short entry
            # Entry filters above are long-side conditions (rsi_buy_below /
            # price_above_ema); shorts keep the plain EMA cross.
            pass
        entry_index, entry, distance = signal_index + 1, candles[signal_index + 1].open, atr_values[signal_index] * stop_mult
        stop, target = (entry - distance, entry + distance * target_rr) if side == 1 else (entry + distance, entry - distance * target_rr)
        exit_index, exit_price, reason = len(candles) - 1, candles[-1].close, 'end_of_data'
        for j in range(entry_index, len(candles)):
            candle = candles[j]
            # Conservative order when both barriers are touched in an OHLC bar is stop first.
            hit_stop = candle.low <= stop if side == 1 else candle.high >= stop
            hit_target = candle.high >= target if side == 1 else candle.low <= target
            if hit_stop or hit_target:
                exit_index, exit_price, reason = j, (stop if hit_stop else target), ('stop_loss' if hit_stop else 'target')
                break
        return_pct = side * (exit_price - entry) / entry
        position_value = equity * (risk_pct / 100) / max(distance / entry, 1e-12)
        pnl = position_value * return_pct; equity += pnl
        trades.append({'signal_index': signal_index, 'entry_index': entry_index, 'exit_index': exit_index, 'side': 'long' if side == 1 else 'short', 'entry': entry, 'stop_loss': stop, 'target': target, 'exit': exit_price, 'exit_reason': reason, 'pnl': pnl, 'return_pct': return_pct * 100})
        curve.extend([equity] * max(1, exit_index - signal_index)); next_free = exit_index + 1
    returns = [trade['pnl'] / initial_capital for trade in trades]; wins, losses = [x for x in returns if x > 0], [x for x in returns if x < 0]
    avg = sum(returns) / len(returns) if returns else 0; std = statistics.pstdev(returns) if len(returns) > 1 else 0
    downside = [min(item, 0) for item in returns]; dstd = statistics.pstdev(downside) if len(downside) > 1 else 0
    peak, drawdown = initial_capital, 0
    for value in curve: peak, drawdown = max(peak, value), min(drawdown, (value - peak) / peak)
    # Profit factor is unbounded when there are wins but zero losses; cap it to a
    # large finite value so it stays JSON-serializable (json cannot encode inf).
    PROFIT_FACTOR_CAP = 1e9
    profit_factor = sum(wins) / abs(sum(losses)) if losses else (PROFIT_FACTOR_CAP if wins else 0)
    return BacktestResult((equity / initial_capital - 1) * 100, len(wins) / len(returns) * 100 if returns else 0, profit_factor, avg / std * math.sqrt(len(returns)) if std else 0, avg / dstd * math.sqrt(len(returns)) if dstd else 0, abs(drawdown) * 100, avg * 100, len(trades), curve, trades).__dict__
