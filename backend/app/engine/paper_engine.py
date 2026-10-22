import asyncio
import logging
from typing import Dict, Any
from ..db.models import PaperStrategyState
from ..market.stream import stream as market_stream

logger = logging.getLogger(__name__)

class PaperTradingEngine:
    def __init__(self):
        self.running = False
        self._status = {
            "is_running": False,
            "daily_trades_today": 0,
            "max_daily_trades": 3,
            "active_symbol": "BTCUSDT",
            "active_timeframe": "5m",
            "open_positions": []
        }

    async def start(self):
        if not self.running:
            self.running = True
            self._status["is_running"] = True
            logger.info("PaperTradingEngine started")

    async def stop(self):
        self.running = False
        self._status["is_running"] = False
        logger.info("PaperTradingEngine stopped")

    def get_status(self):
        return self._status

    def update_config(self, symbol: str, timeframe: str, config: dict):
        self._status["active_symbol"] = symbol
        self._status["active_timeframe"] = timeframe
        logger.info(f"PaperTradingEngine config updated: {symbol} {timeframe}")

engine = PaperTradingEngine()
