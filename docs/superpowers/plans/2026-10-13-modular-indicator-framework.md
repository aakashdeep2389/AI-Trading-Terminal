# Modular Indicator Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a modular indicator framework in the backtesting engine supporting Bollinger Bands and Daily Fibonacci Pivots.

**Architecture:** Add dynamic indicators via an extensible `custom_indicators` list on `StrategySchema`. Implement indicator mathematical logic in `engine/indicators.py`, update `engine/backtesting.py` to evaluate them, and add configuration controls in `frontend/components/StrategiesView.tsx`.

**Tech Stack:** FastAPI, Pydantic v2, Python `statistics` / `pandas`, Next.js 15, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-13-modular-indicator-framework-design.md`

## Global Constraints

- Python computes all indicators and trading values (in accordance with `CLAUDE.md`).
- Deterministic, test-driven implementations with explicit expected values.
- Clean separation between indicator math and backtest trade execution.

---

### Task 1: Add Bollinger Bands and Daily Fibonacci Pivots Functions

**Files:**
- Modify: `backend/app/engine/indicators.py`
- Test: `backend/tests/test_indicators.py`

**Interfaces:**
- Produces:
  - `bollinger_bands(values: Sequence[float], period: int = 20, num_std: float = 2.0) -> dict` returning `{'upper': list, 'middle': list, 'lower': list}`
  - `fibonacci_pivots(high: float, low: float, close: float) -> dict` returning `{'pivot': float, 'r1': float, 'r2': float, 'r3': float, 's1': float, 's2': float, 's3': float}`

- [ ] **Step 1: Write the failing tests in `test_indicators.py`**

```python
def test_bollinger_bands():
    from app.engine.indicators import bollinger_bands
    values = [10.0] * 30
    bb = bollinger_bands(values, period=20, num_std=2.0)
    assert len(bb['middle']) == 30
    assert bb['middle'][-1] == 10.0
    assert bb['upper'][-1] == 10.0
    assert bb['lower'][-1] == 10.0

def test_fibonacci_pivots():
    from app.engine.indicators import fibonacci_pivots
    pivots = fibonacci_pivots(high=150.0, low=100.0, close=120.0)
    # Pivot = (150 + 100 + 120) / 3 = 123.3333
    # Range = 50.0
    # R1 = 123.3333 + 0.382 * 50 = 142.4333
    # S1 = 123.3333 - 0.382 * 50 = 104.2333
    assert round(pivots['pivot'], 2) == 123.33
    assert round(pivots['r1'], 2) == 142.43
    assert round(pivots['s1'], 2) == 104.23
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_indicators.py::test_bollinger_bands backend/tests/test_indicators.py::test_fibonacci_pivots`
Expected: FAIL with "ImportError: cannot import name"

- [ ] **Step 3: Implement `bollinger_bands` and `fibonacci_pivots` in `backend/app/engine/indicators.py`**

```python
import math

def bollinger_bands(values: Sequence[float], period: int = 20, num_std: float = 2.0):
    _validate(values, period)
    middle = sma(values, period)
    upper = [None] * len(values)
    lower = [None] * len(values)
    for i in range(period - 1, len(values)):
        window = values[i - period + 1 : i + 1]
        mean = middle[i]
        variance = sum((x - mean) ** 2 for x in window) / period
        std = math.sqrt(variance)
        upper[i] = mean + num_std * std
        lower[i] = mean - num_std * std
    return {'upper': upper, 'middle': middle, 'lower': lower}

def fibonacci_pivots(high: float, low: float, close: float) -> dict:
    pivot = (high + low + close) / 3.0
    rng = high - low
    return {
        'pivot': pivot,
        'r1': pivot + 0.382 * rng,
        'r2': pivot + 0.618 * rng,
        'r3': pivot + 1.000 * rng,
        's1': pivot - 0.382 * rng,
        's2': pivot - 0.618 * rng,
        's3': pivot - 1.000 * rng,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_indicators.py::test_bollinger_bands backend/tests/test_indicators.py::test_fibonacci_pivots`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/indicators.py backend/tests/test_indicators.py
git commit -m "feat(engine): add bollinger bands and fibonacci pivots"
```

---

### Task 2: Extend Strategy Schema for Custom Indicators

**Files:**
- Modify: `backend/app/strategies/schemas.py`
- Modify: `backend/tests/test_strategy_schemas.py`

**Interfaces:**
- Produces:
  - `IndicatorConfig` model: `type: str`, `params: Dict[str, Any]`
  - `StrategySchema.custom_indicators: List[IndicatorConfig] = []`

- [ ] **Step 1: Write the failing test in `test_strategy_schemas.py`**

```python
def test_strategy_with_custom_indicators():
    from app.strategies.schemas import StrategySchema, IndicatorConfig
    strategy = StrategySchema(
        name="BB Strategy",
        custom_indicators=[
            IndicatorConfig(type="bollinger_bands", params={"period": 20, "num_std": 2.0}),
            IndicatorConfig(type="fibonacci_pivots", params={"lookback_days": 1})
        ]
    )
    assert len(strategy.custom_indicators) == 2
    assert strategy.custom_indicators[0].type == "bollinger_bands"
    assert strategy.custom_indicators[0].params["period"] == 20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_strategy_schemas.py::test_strategy_with_custom_indicators`
Expected: FAIL with "ImportError: cannot import name 'IndicatorConfig'"

- [ ] **Step 3: Update `StrategySchema` in `backend/app/strategies/schemas.py`**

Add:
```python
class IndicatorConfig(BaseModel):
    type: str
    params: Dict[str, Any] = {}
```
And update `StrategySchema`:
```python
custom_indicators: List[IndicatorConfig] = []
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_strategy_schemas.py::test_strategy_with_custom_indicators`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/strategies/schemas.py backend/tests/test_strategy_schemas.py
git commit -m "feat(strategies): add custom_indicators to StrategySchema"
```

---

### Task 3: Support Bollinger Bands & Fib Pivots in Backtesting Engine

**Files:**
- Modify: `backend/app/engine/backtesting.py`
- Modify: `backend/tests/test_backtesting.py`

**Interfaces:**
- Consumes: `bollinger_bands`, `fibonacci_pivots`, `IndicatorConfig`
- Produces: Entry filters and signals evaluated against BB bands (e.g. buy when below lower band, sell when above upper band) and Pivot levels.

- [ ] **Step 1: Write the failing test in `test_backtesting.py`**

```python
def test_backtest_with_bollinger_bands():
    from app.engine.backtesting import backtest
    from app.market.models import Candle
    # 50 candles with high variance to trigger BB band dip
    prices = [100.0] * 30 + [80.0, 81.0, 82.0] + [100.0] * 20
    candles = [Candle(time=i, open=p, high=p+1, low=p-1, close=p, volume=10) for i, p in enumerate(prices)]
    strategy = {
        'fast': 2,
        'slow': 5,
        'custom_indicators': [
            {'type': 'bollinger_bands', 'params': {'period': 20, 'num_std': 2.0, 'signal': 'bounce_lower'}}
        ]
    }
    result = backtest(candles, strategy)
    assert 'trades' in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_backtesting.py::test_backtest_with_bollinger_bands`
Expected: FAIL or run without using the custom indicators.

- [ ] **Step 3: Update `backtest` in `backend/app/engine/backtesting.py`**

Incorporate parsing of `custom_indicators` from the strategy:
- Calculate `bollinger_bands` if present in `custom_indicators`.
- Check if price touches or crosses lower/upper band to filter or trigger entries.
- Calculate daily pivot levels if `fibonacci_pivots` is present.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_backtesting.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/backtesting.py backend/tests/test_backtesting.py
git commit -m "feat(backtesting): integrate custom indicators into backtest logic"
```

---

### Task 4: Frontend Integration in StrategiesView

**Files:**
- Modify: `frontend/components/StrategiesView.tsx`

**Interfaces:**
- Consumes: `custom_indicators` array on `StrategyConfig`
- Produces: UI inputs to add and configure Bollinger Bands and Fibonacci Pivots in the strategy panel.

- [ ] **Step 1: Add Indicator interfaces to `frontend/components/StrategiesView.tsx`**

```typescript
export interface IndicatorConfig {
  type: string;
  params: Record<string, any>;
}
```
Update `StrategyConfig`:
```typescript
custom_indicators?: IndicatorConfig[];
```

- [ ] **Step 2: Add Preset for Bollinger Bands & Fibonacci Pivots**

Add to `PRESETS`:
```typescript
{
  label: 'Bollinger Mean Reversion',
  config: {
    ...
    custom_indicators: [
      { type: 'bollinger_bands', params: { period: 20, num_std: 2.0, signal: 'bounce_lower' } },
      { type: 'fibonacci_pivots', params: { lookback_days: 1 } }
    ]
  }
}
```

- [ ] **Step 3: Add UI Section in `StrategiesView.tsx` under a new or existing tab**

Add toggles/inputs for:
- Enable Bollinger Bands: Period (default 20), StdDev (default 2.0)
- Enable Fibonacci Pivots: Daily Pivots

- [ ] **Step 4: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: PASS with 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/components/StrategiesView.tsx
git commit -m "feat(frontend): add bollinger bands and fibonacci pivots to StrategiesView"
```
