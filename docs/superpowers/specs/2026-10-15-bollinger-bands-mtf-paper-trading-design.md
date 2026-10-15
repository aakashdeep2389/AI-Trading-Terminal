# Specification: Bollinger Bands Multi-Timeframe Strategy & Continuous Paper Trading

**Date:** 2026-10-15  
**Status:** Approved  
**Author:** AI Trading Assistant & Engineering Team  

---

## 1. Executive Summary

This specification outlines the architecture, rules, and integration for a Bollinger Bands Multi-Timeframe (MTF) trading strategy with continuous live paper trading and automated recording into the Trading Journal.

The system evaluates market data deterministically using pure Python, executes paper trades according to strict risk/reward parameters (1:3 RR, max 3 trades per trading day), monitors positions continuously in the background, and persists all setups and trades in PostgreSQL. A dedicated top-level **Testing / Paper Trading** tab in the Next.js frontend gives traders full control and real-time observability over the strategy setup, live paper positions, and performance statistics.

---

## 2. Invariants & Architecture Compliance

1. **Deterministic Calculations (`AGENT_RULES.md`):** All indicator values, alert candle detections, breakout/breakdown signals, and position sizing/P&L calculations are computed in Python. The LLM only narrates or explains pre-computed values.
2. **Provider Precedence:** Live market data adheres to configured provider precedence (Twelve Data / Free Public fallback) without substituting fake data unless running under an explicitly labeled demo mode.
3. **Multi-Timeframe Synchronization:** 15-minute signals strictly synchronize with 5-minute execution candles without lookahead bias. A 5-minute entry confirmation candle can only occur after the 15-minute confirmation candle has fully closed.
4. **Trading Journal Single Source of Truth:** All executed paper trades (open, win, loss, breakeven) are persisted directly to the `journal_trades` table so that the Trading Journal tab and Testing tab stay in sync.

---

## 3. Indicator Configuration

### 3.1 Bollinger Bands
- **Length / Period:** 20
- **Basis MA:** Simple Moving Average (SMA)
- **Source:** Close price
- **Standard Deviation Multiplier:** 1.4
- **Offset:** 0
- **Timeframes:** 5-minute (for Sell strategy) and 15-minute (for Buy strategy alert)

### 3.2 Daily Fibonacci Pivot Points
- **Pivot Type:** Fibonacci
- **Pivot Timeframe:** Daily (1D)
- **Historical Depth:** 15 historical daily sessions
- **Formula:**
  - $P = \frac{High_{prev} + Low_{prev} + Close_{prev}}{3}$
  - $Range = High_{prev} - Low_{prev}$
  - $R_1 = P + 0.382 \times Range$, $R_2 = P + 0.618 \times Range$, $R_3 = P + 1.000 \times Range$
  - $S_1 = P - 0.382 \times Range$, $S_2 = P - 0.618 \times Range$, $S_3 = P - 1.000 \times Range$

### 3.3 Swing Support & Resistance
- Fractal swing detection (order = 5 candles) over recent candle history.
- Cluster grouping within 0.3% price tolerance to identify key horizontal levels.

---

## 4. Strategy Rules & Execution Logic

### 4.1 Sell Strategy (5-Minute Timeframe)
1. **Alert Candle Condition:**
   - Evaluated on completed 5-minute candles.
   - The entire high-low range must be strictly below the Upper Bollinger Band ($High < UpperBB$ and $Low < UpperBB$). Neither wick nor body may touch or exceed the upper band.
   - Upon detection, record the alert candle: `timestamp`, `high`, `low`, `close`, and indicator levels.
2. **Breakdown Confirmation:**
   - The next eligible completed 5-minute candle must break below the alert candle's low ($Low_{curr} < Low_{alert}$).
   - Must confirm within configurable expiry bars (default: 3 bars). If not confirmed within 3 bars, the alert expires and is cleared.
3. **Entry Execution:**
   - Enter a **Short** paper trade upon confirmed breakdown.
   - Entry Price = Open of the subsequent bar or breakdown trigger price.

### 4.2 Buy Strategy (15-Minute Signal, 5-Minute Entry)
1. **Alert Candle Condition (15-Minute Timeframe):**
   - Evaluated on completed 15-minute candles.
   - The entire high-low range must be strictly above the Lower Bollinger Band ($Low > LowerBB$ and $High > LowerBB$). Neither wick nor body may touch or breach the lower band.
   - Record the 15-minute alert candle: `timestamp`, `high`, `low`, `close`.
2. **Bullish Confirmation (15-Minute Timeframe):**
   - The next completed 15-minute candle must break above the alert candle's high ($High_{curr} > High_{alert}$).
   - The setup remains pending for 5-minute execution only after this 15-minute candle is officially closed.
3. **Entry Confirmation (5-Minute Timeframe):**
   - Once the 15-minute bullish setup is confirmed, monitor 5-minute candles.
   - Enter a **Long** paper trade when a subsequent 5-minute candle confirms a breakout above the relevant alert candle high.
   - Invalidation rules:
     - Expires after configurable expiry window (default: 6 five-minute candles = 30 minutes).
     - Invalidated if price pulls back below the 15m alert candle's low before entry.
     - Invalidated if price has moved beyond the maximum acceptable entry distance (e.g. > 1.5 ATR from trigger).

---

## 5. Stop-Loss, Take-Profit & Risk Management

### 5.1 Strict 1:3 Risk/Reward Ratio
- **Long Setup:**
  - $StopLoss = AlertLow - Buffer$ (buffer configurable, default 0 or 0.1 ATR).
  - $InitialRisk = EntryPrice - StopLoss$.
  - If $InitialRisk \le 0$ or $InitialRisk / EntryPrice > MaxRiskPct$, reject entry.
  - $TakeProfit = EntryPrice + (3 \times InitialRisk)$.
- **Short Setup:**
  - $StopLoss = AlertHigh + Buffer$.
  - $InitialRisk = StopLoss - EntryPrice$.
  - If $InitialRisk \le 0$ or $InitialRisk / EntryPrice > MaxRiskPct$, reject entry.
  - $TakeProfit = EntryPrice - (3 \times InitialRisk)$.

### 5.2 Conservative Fill Policy
- If both the Stop-Loss and Take-Profit price levels are touched within the same candle (OHLC bar), execution policy dictates that the **Stop-Loss executes first**.

---

## 6. Confluence & Opposing Level Filter

Before dispatching an entry, evaluate confluence:
1. **Daily Fibonacci Pivots:** Proximity to Pivot $P$, $S_1-S_3$, $R_1-R_3$ (within 0.2% tolerance).
2. **Swing S/R Alignment:** Rejection or bounce off established swing levels.
3. **Confluence Score:**
   - Base BB signal: Required.
   - Pivot alignment (+1): Pivot or S/R support for long / resistance for short.
   - Filter check: If a trade target (Take Profit) requires driving through a major opposing S/R level that is closer than the $1:3$ distance, entry is filtered out or flagged.

---

## 7. Daily Trade Limit & Duplicate Prevention

1. **Daily Quota:** Maximum 3 new trade entries per trading day for this strategy.
2. **Persistence:** Trade count is queried from PostgreSQL `journal_trades` filtered by `strategy_tag = 'Bollinger Bands MTF Paper'` and `trade_date >= current_trading_day_start`.
3. **Trading Day Boundary:** Configured timezone (default UTC 00:00:00).
4. **Deduplication:** State tracked with unique key `(symbol, strategy_tag, candle_timestamp)` to prevent multiple entries on repeated WebSocket ticks.

---

## 8. Background Paper Trading Engine Lifecycle

- **Module:** `backend/app/engine/paper_engine.py`
- **State Table:** `paper_strategy_states`
  - `id`: integer PK
  - `symbol`: string (e.g. BTCUSDT, XAUUSD)
  - `enabled`: boolean
  - `active_setup`: JSON (contains alert candle info, pending timeframe, expiry)
  - `open_position_id`: integer FK -> `journal_trades.id` (or null)
  - `updated_at`: datetime
- **Lifecycle Integration:**
  - Starts as background async worker in FastAPI lifespan.
  - Subscribes to closed candle events from `MarketStream` aggregator.
  - Evaluates entry signals on closed 5m / 15m bars.
  - On every price tick / candle update, verifies stop-loss and take-profit for open paper positions.
  - Exits update the `journal_trades` record directly (`exit_price`, `pnl`, `pnl_pct`, `outcome`, `notes`).

---

## 9. API & Frontend Architecture

### 9.1 REST API (`backend/app/api/paper_routes.py`)
- `GET /api/paper/status` -> `{ enabled: bool, symbol: str, today_trades: int, max_daily_trades: int, active_setup: dict, open_position: dict, stats: dict }`
- `POST /api/paper/start` -> `{ status: "started" }`
- `POST /api/paper/stop` -> `{ status: "stopped" }`
- `POST /api/paper/config` -> Update BB length, std dev, buffer, max trades, confluence tolerance.
- `POST /api/backtests/bollinger-mtf` -> Run historical multi-timeframe backtest with 15m/5m synchronization and 1:3 RR.

### 9.2 Frontend Testing Tab (`frontend/components/TestingView.tsx`)
- Integrated into `frontend/app/page.tsx` as the **🧪 Testing** tab.
- **Components:**
  1. Header Status Bar: Engine state (Running / Stopped), Trades Today badge (`X / 3`), and Symbol switch.
  2. Strategy Builder Form: BB Length, StdDev (1.4), Daily Pivot toggle, Confluence threshold, and Stop buffer.
  3. Live Setup Monitor: Real-time status cards showing current alert candle, confirmation status, and countdown to expiry.
  4. Active Position Tracker: Real-time P&L, entry price, SL, and 1:3 TP.
  5. Trade Stream & Journal Link: Table of recent paper trades with direct link to Trading Journal.
  6. Backtest Runner: Integrated backtest stats and equity curve for the MTF setup.

---

## 10. Verification Plan

1. **Unit Tests (`backend/tests/test_bollinger_mtf.py`):**
   - Bollinger Band touch vs no-touch detection.
   - Alert candle identification on 5m and 15m candles.
   - Sell breakdown and Buy breakout confirmation.
   - 15m-to-5m synchronization without lookahead bias.
   - SL & 1:3 TP calculations, conservative stop execution when both barriers touched in same bar.
   - Daily limit (max 3/day) enforcement and reset.
2. **Integration Tests (`backend/tests/test_paper_engine.py`):**
   - Paper trade execution -> `journal_trades` insertion.
   - Position tracking -> SL/TP trigger -> `journal_trades` update.
   - Server restart recovery from `paper_strategy_states`.
3. **Frontend Build & UI Testing:**
   - `npm run build` cleanly passes without TypeScript or lint errors.
   - Testing tab renders and interacts with backend API.
