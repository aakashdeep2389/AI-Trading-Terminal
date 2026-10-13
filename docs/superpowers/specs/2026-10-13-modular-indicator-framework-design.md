# Modular Indicator Framework Design

**Goal:** Enhance the backtesting strategy framework to support modular, extensible indicators, starting with Bollinger Bands and Daily Fibonacci Pivots.

**Architecture:**
Instead of modifying the core `StrategySchema` for every new indicator, we will implement a `custom_indicators` list in the `StrategySchema`.
- Each indicator in the list will follow a standard interface: `{"type": str, "params": dict}`.
- The `backtest` engine will dynamically instantiate or invoke the necessary indicator logic based on this configuration.

**Requirements:**
1. **Extensibility**: Adding a new indicator must not require changing `StrategySchema`.
2. **Bollinger Bands**: Period, StdDev multiplier.
3. **Daily Fibonacci Pivots**: Based on Daily High/Low/Close.
4. **Backtesting**: Entry/Exit signals can be derived from these indicators.
5. **UI**: `StrategiesView.tsx` must support dynamically adding/configuring these indicators.

**Key Files:**
- `backend/app/strategies/schemas.py`: Add `IndicatorConfig(BaseModel)` and `custom_indicators: List[IndicatorConfig]`.
- `backend/app/engine/indicators.py`: Add `bollinger_bands` and `fibonacci_pivots` functions.
- `backend/app/engine/backtesting.py`: Update `backtest` to accept `custom_indicators` and process them.
- `frontend/components/StrategiesView.tsx`: Add UI for dynamic indicator management.
