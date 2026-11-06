import asyncio

from app.integrations.telegram import telegram_client
from app.strategies.bollinger_bands import BollingerBandsStrategy, Candle


def _candles(count=25, start=1_700_000_000, step=300):
    return [
        Candle(
            time=start + i * step,
            open=100.0,
            high=105.0,
            low=95.0,
            close=100.0,
        )
        for i in range(count)
    ]


def test_completed_breakout_dispatches_telegram(monkeypatch):
    strategy = BollingerBandsStrategy()
    sent = []

    async def fake_send(message, disable_notification=False):
        sent.append(message)
        return True

    monkeypatch.setattr(telegram_client, 'send_message', fake_send)
    candles = _candles()
    candles.append(Candle(time=candles[-1].time + 300, open=100, high=120, low=99, close=115))

    asyncio.run(strategy.on_candle_closed('BTCUSDT', '5m', candles[-1]))
    # Feed history through the public callback exactly as the stream does.
    strategy.history.clear()
    for candle in candles:
        asyncio.run(strategy.on_candle_closed('BTCUSDT', '5m', candle))

    assert sent
    assert 'BOLLINGER BAND BREAKOUT' in sent[-1]
    assert 'BTCUSDT' in sent[-1]


def test_buy_breakout_preserves_confirmation_state():
    strategy = BollingerBandsStrategy()
    candles = _candles(25, step=900)
    strategy.buy_alerts['BTCUSDT'] = strategy.buy_alerts.get('BTCUSDT') or None
    # Use a controlled state and patched bands to isolate the transition guard.
    from app.strategies.bollinger_bands import BuyAlertState
    strategy.buy_alerts['BTCUSDT'] = BuyAlertState(
        symbol='BTCUSDT',
        alert_candle_time=candles[-1].time - 900,
        alert_candle_high=100,
        alert_candle_low=90,
    )
    candles[-1] = Candle(time=candles[-1].time, open=100, high=110, low=100, close=108)

    strategy.process_15m_candles('BTCUSDT', candles)

    assert strategy.buy_alerts['BTCUSDT'].status == 'AWAITING_5M_CONFIRMATION'
    assert strategy.buy_alerts['BTCUSDT'].alert_candle_time == candles[-2].time
