from __future__ import annotations
import httpx
from datetime import datetime, timezone
from .base import MarketProvider
from ..models import Candle, Tick

GOLD_API_URL = 'https://api.gold-api.com/price/XAU'
BINANCE_BASE = 'https://api.binance.com'
BINANCE_INTERVAL = {'1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d'}
FALLBACK_STEP = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400}


class FreeMarketProvider(MarketProvider):
    """Keyless public sources used as a real-data fallback when a keyed
    provider is rate-limited or unreachable:

    - XAUUSD  -> gold-api.com spot price (no key)
    - BTCUSDT -> Binance public REST: 24h ticker + OHLC history

    Live gold (gold-api.com) and BTC (Binance) were verified reachable at build
    time. No API key required, so the app can always serve real prices.
    """

    name = 'free-public'

    # -- internal helpers ---------------------------------------------------

    async def _gold_spot(self) -> float:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(GOLD_API_URL)
            r.raise_for_status()
            return float(r.json()['price'])

    # -- MarketProvider interface -------------------------------------------

    async def latest_tick(self, symbol: str) -> Tick:
        sym = symbol.upper()
        async with httpx.AsyncClient(timeout=10) as client:
            if sym == 'XAUUSD':
                r = await client.get(GOLD_API_URL)
                r.raise_for_status()
                d = r.json()
                price = float(d['price'])
                ts = datetime.fromisoformat(d['updatedAt'].replace('Z', '+00:00'))
                volume = 0.0
            elif sym == 'BTCUSDT':
                r = await client.get(f'{BINANCE_BASE}/api/v3/ticker/24hr', params={'symbol': sym})
                r.raise_for_status()
                d = r.json()
                price = float(d['lastPrice'])
                ts = datetime.fromtimestamp(d['closeTime'] / 1000, tz=timezone.utc)
                volume = float(d.get('volume', 0) or 0)
            else:
                raise ValueError(f'FreeMarketProvider has no live price for {sym!r}')
        return Tick(symbol=sym, price=price, timestamp=ts, volume=volume)

    async def historical(self, symbol: str, timeframe: str, limit: int) -> list[Candle]:
        sym = symbol.upper()
        limit = min(int(limit), 1000)

        if sym == 'BTCUSDT' and timeframe in BINANCE_INTERVAL:
            return await self._binance_klines(timeframe, limit)

        if sym == 'XAUUSD':
            return await self._anchored_gold_history(timeframe, limit)

        raise ValueError(f'FreeMarketProvider has no candle history for {sym} {timeframe}')

    async def _binance_klines(self, timeframe: str, limit: int) -> list[Candle]:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f'{BINANCE_BASE}/api/v3/klines',
                params={'symbol': 'BTCUSDT', 'interval': BINANCE_INTERVAL[timeframe], 'limit': limit},
            )
            r.raise_for_status()
            arr = r.json()
        return [
            Candle(time=int(k[0]) // 1000, open=float(k[1]), high=float(k[2]),
                   low=float(k[3]), close=float(k[4]), volume=float(k[5]))
            for k in arr
        ]

    async def _anchored_gold_history(self, timeframe: str, limit: int) -> list[Candle]:
        """Reject gold history when no real historical source is available.

        A spot quote cannot be expanded into OHLC candles without inventing
        market data. The configured historical provider must supply the chart
        series; callers should surface the unavailable state instead.
        """
        raise RuntimeError(
            'No real XAUUSD historical data source is available from the free provider; '
            'configure a Twelve Data key for chart history.'
        )
