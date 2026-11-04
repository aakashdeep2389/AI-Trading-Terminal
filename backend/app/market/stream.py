from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone
from .service import get_tick
from .providers.free import FreeMarketProvider
from .models import Tick
from .aggregator import CandleAggregator, TIMEFRAME_SECONDS
from .realtime import hub
from ..db.database import SessionLocal
from ..db.models import CandleRecord
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from ..core.config import settings
from ..strategies.bollinger_bands import bb_strategy

logger = logging.getLogger(__name__)

# Keyless public source for live ticks (gold-api.com / Binance). The 60s
# streaming loop must never draw from the Twelve Data daily credit budget;
# the keyed provider is reserved for historical chart data instead.
_free_provider = FreeMarketProvider()


async def _stream_tick(symbol: str) -> Tick:
    """Fetch a price and timestamp it at receipt time for candle aggregation.

    Quote endpoints can return the last exchange session timestamp rather than
    the time this poll occurred. Using that stale timestamp would keep every
    poll in one candle bucket, so the stream uses its receipt time as the
    canonical live-stream timestamp.
    """
    try:
        tick = await get_tick(symbol)
    except Exception:
        tick = await _free_provider.latest_tick(symbol)
    return tick.model_copy(update={'timestamp': datetime.now(timezone.utc)})

SYMBOLS = ('BTCUSDT', 'XAUUSD')
TIMEFRAMES = tuple(TIMEFRAME_SECONDS)

class MarketStream:
    def __init__(self):
        self.tasks: dict[str, asyncio.Task] = {}
        self.aggs = {(s, tf): CandleAggregator(tf) for s in SYMBOLS for tf in TIMEFRAMES}
        self.last_tick: dict[str, dict] = {}
        self.last_closed: dict[str, dict] = {}
        self.last_error: dict[str, str] = {}
        self.iterations: dict[str, int] = {}

    def status(self) -> dict:
        return {
            'running': {symbol: not task.done() for symbol, task in self.tasks.items()},
            'symbols': SYMBOLS,
            'timeframes': TIMEFRAMES,
            'iterations': self.iterations,
            'last_tick': self.last_tick,
            'last_closed': self.last_closed,
            'last_error': self.last_error,
            'aggregators': {
                f'{symbol}:{timeframe}': {
                    'current_time': aggregator.current.time if aggregator.current else None,
                    'last_closed_time': aggregator.last_closed.time if aggregator.last_closed else None,
                }
                for (symbol, timeframe), aggregator in self.aggs.items()
            },
        }

    async def start(self):
        for symbol in SYMBOLS:
            self.tasks[symbol] = asyncio.create_task(self._run(symbol), name=f'market-{symbol}')
        logger.info('Market stream started symbols=%s timeframes=%s', SYMBOLS, TIMEFRAMES)

    async def stop(self):
        for task in self.tasks.values(): task.cancel()
        if self.tasks: await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        self.tasks.clear()

    async def _persist(self, symbol, timeframe, candle):
        try:
            async with SessionLocal() as session:
                stmt = insert(CandleRecord).values(symbol=symbol,timeframe=timeframe,time=candle.time,open=candle.open,high=candle.high,low=candle.low,close=candle.close,volume=candle.volume)
                stmt = stmt.on_conflict_do_update(index_elements=['symbol','timeframe','time'], set_={'high':candle.high,'low':candle.low,'close':candle.close,'volume':candle.volume})
                await session.execute(stmt); await session.commit()
        except Exception:
            # Persistence is best-effort: a down/absent database (e.g. local
            # dev without Docker) surfaces as OSError (ConnectionRefusedError),
            # which is not a SQLAlchemyError and must not kill the stream loop.
            return

    async def _run(self, symbol):
        """Poll one symbol without allowing a transient provider failure to stop it."""
        while True:
            try:
                tick = await _stream_tick(symbol)
                self.iterations[symbol] = self.iterations.get(symbol, 0) + 1
                self.last_tick[symbol] = tick.model_dump(mode='json')
                self.last_error.pop(symbol, None)
                await hub.publish_tick(tick)
                for tf in TIMEFRAMES:
                    candle, opened = self.aggs[(symbol, tf)].update(tick)
                    await hub.publish_candle(symbol, tf, candle)
                    closed = self.aggs[(symbol, tf)].last_closed
                    if closed is not None:
                        logger.info('Candle closed symbol=%s timeframe=%s time=%s', symbol, tf, closed.time)
                        await hub.publish_candle_closed(symbol, tf, closed)
                        self.last_closed[f'{symbol}:{tf}'] = closed.model_dump()
                        await self._persist(symbol, tf, closed)
                        await bb_strategy.on_candle_closed(symbol, tf, closed)
                        self.aggs[(symbol, tf)].last_closed = None
                    await self._persist(symbol, tf, candle)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                # A provider outage or notification failure must not permanently
                # disable candle-close alerts for this symbol.
                self.last_error[symbol] = f'{type(exc).__name__}: {exc}'
                logger.exception('Market stream iteration failed for %s', symbol)
            await asyncio.sleep(60) # Increased to 60s to respect free tier rate limit (8 calls/min)

stream = MarketStream()
