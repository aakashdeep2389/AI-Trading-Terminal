# Bollinger Band Breakout Telegram Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement new strategy logic that detects when a candle closes above the upper Bollinger Band or below the lower Bollinger Band and sends a Telegram alert notification.

**Architecture:** Extend `BollingerBandsStrategy` in `backend/app/strategies/bollinger_bands.py` with breakout detection and integrate it with the `stream.py` `on_candle_closed` event and API routes.

**Tech Stack:** FastAPI, Python 3.11+, Pytest, httpx (Telegram client).

---

### Task 1: Add Bollinger Band Breakout Logic and Tests

**Files:**
- Modify: `backend/app/strategies/bollinger_bands.py`
- Test: `backend/tests/test_bollinger_bands_strategy.py`

**Interfaces:**
- Produces: `check_bollinger_breakout(self, symbol: str, candles: List[Candle], timeframe: str = "5m") -> Optional[dict]`
- Produces: `on_candle_closed(self, symbol: str, timeframe: str, candle: Candle)`

- [ ] **Step 1: Write failing unit test for breakout detection**

Edit `backend/tests/test_bollinger_bands_strategy.py`:
```python
def test_bollinger_bands_breakout():
    strategy = BollingerBandsStrategy()
    symbol = "BTCUSDT"

    candles = []
    base_time = 1700000000
    for i in range(25):
        candles.append(Candle(time=base_time + i * 300, open=100.0, high=105.0, low=95.0, close=100.0))

    # Upper breakout candle (close > upper band)
    candles.append(Candle(time=base_time + 25 * 300, open=100.0, high=120.0, low=99.0, close=115.0))

    breakout = strategy.check_bollinger_breakout(symbol, candles)
    assert breakout is not None
    assert breakout["breakout_type"] == "UPPER"
    assert breakout["close"] == 115.0
```

- [ ] **Step 2: Run test to verify failure**

Run: `pytest backend/tests/test_bollinger_bands_strategy.py -v`

- [ ] **Step 3: Implement breakout detection and on_candle_closed in strategy**

Edit `backend/app/strategies/bollinger_bands.py`:
Add `check_bollinger_breakout` method to `BollingerBandsStrategy`:
```python
    def check_bollinger_breakout(self, symbol: str, candles: List[Candle], timeframe: str = "5m") -> Optional[dict]:
        if len(candles) < 21:
            return None

        closes = [c.close for c in candles]
        bb = bollinger_bands(closes, period=20, num_std=1.4)
        upper = bb['upper']
        lower = bb['lower']

        if upper[-1] is None or lower[-1] is None:
            return None

        last_candle = candles[-1]
        
        if last_candle.close > upper[-1]:
            return {
                "symbol": symbol,
                "breakout_type": "UPPER",
                "timeframe": timeframe,
                "timestamp": last_candle.time,
                "close": last_candle.close,
                "band_value": upper[-1]
            }
        elif last_candle.close < lower[-1]:
            return {
                "symbol": symbol,
                "breakout_type": "LOWER",
                "timeframe": timeframe,
                "timestamp": last_candle.time,
                "close": last_candle.close,
                "band_value": lower[-1]
            }

        return None

    async def on_candle_closed(self, symbol: str, timeframe: str, candle: Candle):
        # Placeholder/Hook for streaming candle completion
        pass
```

- [ ] **Step 4: Run test to verify pass**

Run: `pytest backend/tests/test_bollinger_bands_strategy.py -v`

- [ ] **Step 5: Commit changes**

```bash
git add backend/app/strategies/bollinger_bands.py backend/tests/test_bollinger_bands_strategy.py
git commit -m "feat(strategy): add Bollinger Band breakout detection"
```

---

### Task 2: Add Telegram Alert for Breakouts and Expose Evaluation Endpoint

**Files:**
- Modify: `backend/app/strategies/bollinger_bands.py`
- Modify: `backend/app/api/routes.py`

- [ ] **Step 1: Add breakout alert message format and Telegram dispatch**

In `backend/app/strategies/bollinger_bands.py`:
```python
    async def notify_breakout(self, breakout: dict):
        dt_str = datetime.utcfromtimestamp(breakout["timestamp"]).strftime('%Y-%m-%d %H:%M:%S UTC')
        type_emoji = "🚀" if breakout["breakout_type"] == "UPPER" else "📉"
        
        msg = (
            f"⚡ <b>BOLLINGER BAND BREAKOUT</b> ⚡\n\n"
            f"• <b>Symbol:</b> <code>{breakout['symbol']}</code>\n"
            f"• <b>Type:</b> {type_emoji} <b>{breakout['breakout_type']} BAND BREAKOUT</b>\n"
            f"• <b>Timeframe:</b> <code>{breakout['timeframe']}</code>\n"
            f"• <b>Time:</b> <code>{dt_str}</code>\n"
            f"• <b>Close Price:</b> <code>{breakout['close']}</code>\n"
            f"• <b>Band Value:</b> <code>{round(breakout['band_value'], 4)}</code>\n"
        )
        await telegram_client.send_message(msg)
```

- [ ] **Step 3: Test endpoint or strategy notification via pytest**

- [ ] **Step 4: Commit changes**

```bash
git add backend/app/strategies/bollinger_bands.py backend/app/api/routes.py
git commit -m "feat(api): add endpoint to evaluate BB breakout and send Telegram alert"
```
