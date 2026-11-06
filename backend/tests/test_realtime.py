import asyncio
import json
import time

from app.market.models import Candle
from app.market.realtime import RealtimeHub
from app.market import stream as market_stream
from app.strategies.bollinger_bands import bb_strategy


class OfflineRedis:
    def pubsub(self):
        raise OSError('Redis unavailable')

    async def publish(self, *_args):
        raise OSError('Redis unavailable')


def test_local_fallback_delivers_candle_when_redis_is_offline():
    async def exercise():
        hub = RealtimeHub()
        hub.redis = OfflineRedis()
        subscription = await hub.subscribe('BTCUSDT', '1m')
        await hub.publish_candle('BTCUSDT', '1m', Candle(time=60, open=100, high=101, low=99, close=100.5, volume=2))
        event = await subscription.get_message(timeout=0.1)
        await subscription.close()
        return event

    event = asyncio.run(exercise())
    payload = json.loads(event['data'])
    assert payload['type'] == 'candle'
    assert payload['data']['close'] == 100.5


def test_local_fallback_delivers_live_bollinger_values_with_candle():
    async def exercise():
        hub = RealtimeHub()
        hub.redis = OfflineRedis()
        subscription = await hub.subscribe('BTCUSDT', '15m')
        await hub.publish_candle(
            'BTCUSDT',
            '15m',
            Candle(time=900, open=100, high=102, low=99, close=101, volume=2),
            {'upper': 105, 'middle': 100, 'lower': 95},
        )
        message = await subscription.get_message(timeout=0.1)
        await subscription.close()
        return message

    payload = json.loads(asyncio.run(exercise())['data'])
    assert payload['data']['bollinger'] == {'upper': 105, 'middle': 100, 'lower': 95}


def test_stream_computes_live_bollinger_values_from_current_close():
    stream = market_stream.MarketStream()
    stream.seed_bollinger_history(
        'BTCUSDT',
        '1h',
        [
            Candle(
                time=1_700_000_000 + index * 3600,
                open=100,
                high=100,
                low=100,
                close=100,
            )
            for index in range(20)
        ],
    )
    bands = stream._live_bollinger(
        'BTCUSDT',
        '1h',
        Candle(time=1_700_072_000, open=100, high=120, low=100, close=120, volume=1),
    )

    assert bands is not None
    assert bands['upper'] > bands['middle'] > bands['lower']


def test_local_fallback_delivers_bollinger_event_on_alert_channel():
    async def exercise():
        hub = RealtimeHub()
        hub.redis = OfflineRedis()
        subscription = await hub.subscribe_channel('ALERTS:notifications')
        event = {
            'type': 'bollinger',
            'event_id': 'bollinger:alert:BTCUSDT:5m:1700000000',
            'kind': 'alert',
            'data': {'symbol': 'BTCUSDT', 'timeframe': '5m', 'timestamp': 1700000000},
            'message': 'SELL Bollinger alert on BTCUSDT (5m)',
        }
        await hub.publish_bollinger(event)
        message = await subscription.get_message(timeout=0.1)
        await subscription.close()
        return message

    message = asyncio.run(exercise())
    assert json.loads(message['data'])['type'] == 'bollinger'


def test_stream_warms_bollinger_history_with_completed_candles(monkeypatch):
    async def exercise():
        original_history = bb_strategy.history.copy()

        async def fake_get_candles(symbol, timeframe, limit):
            step = 300 if timeframe == '5m' else 900
            start = 1_700_000_000
            candles = [
                Candle(
                    time=start + index * step,
                    open=100,
                    high=101,
                    low=99,
                    close=100,
                    volume=1,
                )
                for index in range(25)
            ]
            future_bucket = int(time.time() // step) * step + step
            candles.append(
                Candle(
                    time=future_bucket,
                    open=100,
                    high=101,
                    low=99,
                    close=100,
                    volume=1,
                )
            )
            return candles

        monkeypatch.setattr(market_stream, 'get_candles', fake_get_candles)
        try:
            await market_stream.MarketStream()._warm_bollinger_history()
            for symbol in ('BTCUSDT', 'XAUUSD'):
                for timeframe in ('5m', '15m'):
                    history = bb_strategy.history[f'{symbol}_{timeframe}']
                    assert len(history) == 25
                    assert history[-1].time < int(time.time())
        finally:
            bb_strategy.history.clear()
            bb_strategy.history.update(original_history)

    asyncio.run(exercise())
