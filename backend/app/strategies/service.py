"""Validated declarative strategies. Generated Python is never accepted or executed."""
from __future__ import annotations
import re
from typing import Optional, List, Dict, Any, Literal
from .schemas import (
    UniversalExit,
    OvernightProtection,
    PriceExecution,
    TradingStopLoss,
    AdvancedSettings,
    MarketplaceSettings,
    StrategySchema,
    Strategy,
)

def validate_strategy(data: Any) -> StrategySchema:
    return StrategySchema.model_validate(data)

def parse_strategy_intent(text: str, name: str = 'Natural-language strategy') -> StrategySchema:
    """Small deterministic parser used when an LLM structured-output provider is unavailable."""
    lower = text.lower()
    values: dict = {'name': name}

    # Match fast/slow EMA periods if specified in text (e.g. "EMA crossover strategy with 20 and 50 period")
    ema_match = re.search(r'(?:ema|period|crossover).*?(\d+)\s*(?:and|/|,)\s*(\d+)', lower)
    if ema_match:
        f, s = int(ema_match.group(1)), int(ema_match.group(2))
        if f < s:
            values['fast'] = f
            values['slow'] = s

    rsi = re.search(r'rsi\s*(?:<|below)\s*(\d+(?:\.\d+)?)', lower)
    above = re.search(r'(?:above|over)\s*ema\s*(\d+)', lower)
    stop = re.search(r'(\d+(?:\.\d+)?)\s*atr\s*(?:stop|loss)', lower)
    if rsi:
        values['rsi_buy_below'] = float(rsi.group(1))
    if above:
        values['price_above_ema'] = int(above.group(1))
    if stop:
        values['stop_atr_multiple'] = float(stop.group(1))

    # Example: handling universal_exit description
    universal_exit_desc = re.search(r'exit strategy:\s*(.*)', lower)
    if universal_exit_desc:
        values['universal_exit'] = {'description': universal_exit_desc.group(1).strip()}

    # Example: handling advanced_settings.price_execution
    price_exec_match = re.search(r'price execution:\s*(.*)', lower)
    if price_exec_match:
        values['advanced_settings'] = {'price_execution': {'initial_price': price_exec_match.group(1).strip().capitalize()}}

    return validate_strategy(values)
