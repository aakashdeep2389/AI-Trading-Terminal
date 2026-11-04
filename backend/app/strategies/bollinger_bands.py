import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime

from app.engine.indicators import bollinger_bands
from app.integrations.telegram import telegram_client
from app.core.config import settings

logger = logging.getLogger(__name__)

@dataclass
class Candle:
    time: int  # unix timestamp
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

@dataclass
class SellAlertState:
    symbol: str
    alert_candle_time: int
    alert_candle_high: float
    alert_candle_low: float
    status: str = "AWAITING_CONFIRMATION"  # AWAITING_CONFIRMATION, CONFIRMED, EXPIRED

@dataclass
class BuyAlertState:
    symbol: str
    alert_candle_time: int
    alert_candle_high: float
    alert_candle_low: float
    status: str = "AWAITING_15M_BREAKOUT"  # AWAITING_15M_BREAKOUT, AWAITING_5M_CONFIRMATION, CONFIRMED, EXPIRED
    breakout_15m_high: Optional[float] = None

class BollingerBandsStrategy:
    """
    Deterministic Bollinger Bands MTF Strategy.
    BB Settings: Length 20, SMA basis, Close source, StdDev 1.4, Offset 0.

    Sell Rules:
    - Alert on completed 5m candle when high < upper_band.
    - Confirm sell when a subsequent completed 5m candle breaks below alert candle's low (close < alert_low or low < alert_low).

    Buy Rules:
    - Alert on completed 15m candle when low > lower_band.
    - Confirm subsequent completed 15m candle breaks above alert candle's high (high > alert_high).
    - Then apply 5m bullish entry confirmation (completed 5m candle closes above the 15m alert candle's high).
    """

    def __init__(self):
        self.sell_alerts: Dict[str, SellAlertState] = {}
        self.buy_alerts: Dict[str, BuyAlertState] = {}
        self.processed_signals: set = set()
        self.history: Dict[str, List[Candle]] = {}

    def process_5m_candles(self, symbol: str, candles_5m: List[Candle]) -> Optional[dict]:
        """
        Processes completed 5m candles for Sell signals and Buy 5m bullish confirmation.
        Returns signal dict if confirmed signal is generated, else None.
        """
        if len(candles_5m) < 21:
            return None

        closes = [c.close for c in candles_5m]
        bb = bollinger_bands(closes, period=20, num_std=1.4)
        upper = bb['upper']
        lower = bb['lower']
        middle = bb['middle']

        last_candle = candles_5m[-1]
        prev_candle = candles_5m[-2]
        idx = len(candles_5m) - 1

        # Check existing Sell Alert state for symbol
        sell_state = self.sell_alerts.get(symbol)
        signal_generated = None

        if sell_state and sell_state.status == "AWAITING_CONFIRMATION":
            # Prevent checking the alert candle itself as the confirmation candle
            if last_candle.time > sell_state.alert_candle_time:
                # Subsequent 5m candle breaks below alert candle's low
                if last_candle.low < sell_state.alert_candle_low or last_candle.close < sell_state.alert_candle_low:
                    sig_id = f"{symbol}_SELL_{sell_state.alert_candle_time}_{last_candle.time}"
                    if sig_id not in self.processed_signals:
                        self.processed_signals.add(sig_id)
                        sell_state.status = "CONFIRMED"

                        # Risk calculation (ATR or Swing High based stop loss)
                        stop_loss = round(sell_state.alert_candle_high, 4)
                        entry_price = round(last_candle.close, 4)
                        risk = max(stop_loss - entry_price, 0.0001)
                        target = round(entry_price - (2.0 * risk), 4)

                        signal_generated = {
                            "symbol": symbol,
                            "direction": "SELL",
                            "timeframe": "5m",
                            "timestamp": last_candle.time,
                            "entry": entry_price,
                            "stop_loss": stop_loss,
                            "target": target,
                            "strategy": "Bollinger Bands MTF"
                        }
                        self.sell_alerts.pop(symbol, None)

        # Check for new 5m Sell Alert (high < upper_band, touching is invalid).
        # The alert is sent once when this completed 5m candle qualifies.
        if upper[-1] is not None:
            if last_candle.high < upper[-1]:
                if (symbol not in self.sell_alerts or self.sell_alerts[symbol].status != "AWAITING_CONFIRMATION") and \
                   (signal_generated is None or signal_generated.get("symbol") != symbol):
                    self.sell_alerts[symbol] = SellAlertState(
                        symbol=symbol,
                        alert_candle_time=last_candle.time,
                        alert_candle_high=last_candle.high,
                        alert_candle_low=last_candle.low
                    )

        # Check 5m Bullish Confirmation for active Buy Alert
        buy_state = self.buy_alerts.get(symbol)
        if buy_state and buy_state.status == "AWAITING_5M_CONFIRMATION":
            if last_candle.time > buy_state.alert_candle_time:
                # 5m bullish entry confirmation: completed 5m candle closes above 15m alert high
                if last_candle.close > buy_state.alert_candle_high:
                    sig_id = f"{symbol}_BUY_{buy_state.alert_candle_time}_{last_candle.time}"
                    if sig_id not in self.processed_signals:
                        self.processed_signals.add(sig_id)
                        buy_state.status = "CONFIRMED"

                        stop_loss = round(buy_state.alert_candle_low, 4)
                        entry_price = round(last_candle.close, 4)
                        risk = max(entry_price - stop_loss, 0.0001)
                        target = round(entry_price + (2.0 * risk), 4)

                        signal_generated = {
                            "symbol": symbol,
                            "direction": "BUY",
                            "timeframe": "15m/5m",
                            "timestamp": last_candle.time,
                            "entry": entry_price,
                            "stop_loss": stop_loss,
                            "target": target,
                            "strategy": "Bollinger Bands MTF"
                        }
                        self.buy_alerts.pop(symbol, None)

        return signal_generated

    def process_15m_candles(self, symbol: str, candles_15m: List[Candle]) -> Optional[dict]:
        """
        Processes completed 15m candles for Buy alert and 15m breakout confirmation.
        """
        if len(candles_15m) < 21:
            return None

        closes = [c.close for c in candles_15m]
        bb = bollinger_bands(closes, period=20, num_std=1.4)
        lower = bb['lower']

        last_candle = candles_15m[-1]

        buy_state = self.buy_alerts.get(symbol)

        if buy_state and buy_state.status == "AWAITING_15M_BREAKOUT":
            if last_candle.time > buy_state.alert_candle_time:
                # Subsequent completed 15m candle breaks above alert candle's high
                if last_candle.high > buy_state.alert_candle_high:
                    buy_state.status = "AWAITING_5M_CONFIRMATION"
                    buy_state.breakout_15m_high = last_candle.high

        # Check for new 15m Buy Alert (low > lower_band, touching is invalid).
        # The alert is emitted once when this completed 15m candle qualifies.
        if lower[-1] is not None:
            if last_candle.low > lower[-1]:
                self.buy_alerts[symbol] = BuyAlertState(
                    symbol=symbol,
                    alert_candle_time=last_candle.time,
                    alert_candle_high=last_candle.high,
                    alert_candle_low=last_candle.low
                )
                return {
                    "symbol": symbol,
                    "direction": "BUY_ALERT",
                    "timeframe": "15m",
                    "timestamp": last_candle.time,
                    "entry": round(last_candle.close, 4),
                    "stop_loss": round(last_candle.low, 4),
                    "target": None,
                    "strategy": "Bollinger Bands MTF"
                }

        return None

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
        key = f"{symbol}_{timeframe}"
        if key not in self.history:
            self.history[key] = []

        self.history[key].append(candle)
        if len(self.history[key]) > 50: # Keep a reasonable buffer
            self.history[key].pop(0)

        candles = self.history[key]

        # Run the actual MTF strategy only on its completed candle timeframes.
        # The generic breakout check below is kept as a separate notification.
        signal = None
        alert = None
        if timeframe == "15m":
            previous_alert_time = self.buy_alerts.get(symbol).alert_candle_time if symbol in self.buy_alerts else None
            signal = self.process_15m_candles(symbol, candles)
            state = self.buy_alerts.get(symbol)
            if state and state.alert_candle_time != previous_alert_time and state.alert_candle_time == candle.time:
                alert = {
                    "symbol": symbol,
                    "direction": "BUY",
                    "timeframe": "15m",
                    "timestamp": candle.time,
                    "close": candle.close,
                    "alert_price": state.alert_candle_low,
                    "strategy": "Bollinger Bands MTF",
                }
        elif timeframe == "5m":
            previous_alert_time = self.sell_alerts.get(symbol).alert_candle_time if symbol in self.sell_alerts else None
            signal = self.process_5m_candles(symbol, candles)
            state = self.sell_alerts.get(symbol)
            if state and state.alert_candle_time != previous_alert_time and state.alert_candle_time == candle.time:
                alert = {
                    "symbol": symbol,
                    "direction": "SELL",
                    "timeframe": "5m",
                    "timestamp": candle.time,
                    "close": candle.close,
                    "alert_price": state.alert_candle_high,
                    "strategy": "Bollinger Bands MTF",
                }

        if alert:
            await self.notify_alert(alert)
        if signal:
            await self.notify_signal(signal)

        # Bollinger Telegram notifications are intentionally limited to the
        # strategy timeframes: sell alerts on 5m and buy alerts on 15m.
        if timeframe in ("5m", "15m"):
            breakout = self.check_bollinger_breakout(symbol, candles, timeframe=timeframe)
            if breakout:
                await self.notify_breakout(breakout)

        if settings.candle_close_notifications_enabled:
            await self.notify_candle_close(symbol, timeframe, candle)

    async def notify_candle_close(self, symbol: str, timeframe: str, candle: Candle):
        """Send an explicitly requested candle notification, if enabled."""
        if not settings.candle_close_notifications_enabled:
            return
        if timeframe not in ("5m", "15m"):
            logger.info('Ignoring non-strategy timeframe candle notification: %s %s', symbol, timeframe)
            return

        dt_str = datetime.utcfromtimestamp(candle.time).strftime('%Y-%m-%d %H:%M:%S UTC')
        direction = "🟢 Bullish" if candle.close >= candle.open else "🔴 Bearish"

        msg = (
            f"🕯️ <b>CANDLE CLOSED</b>\n\n"
            f"• <b>Symbol:</b> <code>{symbol}</code>\n"
            f"• <b>Timeframe:</b> <code>{timeframe}</code>\n"
            f"• <b>Time:</b> <code>{dt_str}</code>\n"
            f"• <b>Direction:</b> {direction}\n"
            f"• <b>Open:</b> <code>{candle.open}</code>\n"
            f"• <b>High:</b> <code>{candle.high}</code>\n"
            f"• <b>Low:</b> <code>{candle.low}</code>\n"
            f"• <b>Close:</b> <code>{candle.close}</code>\n"
            f"• <b>Volume:</b> <code>{candle.volume}</code>"
        )
        sent = await telegram_client.send_message(msg)
        if not sent:
            logger.warning('Candle-close Telegram notification was not sent for %s %s', symbol, timeframe)

    async def notify_alert(self, alert: dict):
        """Send the initial timeframe-specific Bollinger alert."""
        dt_str = datetime.utcfromtimestamp(alert['timestamp']).strftime('%Y-%m-%d %H:%M:%S UTC')
        emoji = '🟢' if alert['direction'] == 'BUY' else '🔴'
        msg = (
            f"{emoji} <b>BOLLINGER {alert['direction']} ALERT</b>\n\n"
            f"• <b>Symbol:</b> <code>{alert['symbol']}</code>\n"
            f"• <b>Timeframe:</b> <code>{alert['timeframe']}</code>\n"
            f"• <b>Time:</b> <code>{dt_str}</code>\n"
            f"• <b>Close:</b> <code>{alert['close']}</code>\n"
            f"• <b>Alert price:</b> <code>{alert['alert_price']}</code>"
        )
        sent = await telegram_client.send_message(msg)
        if not sent:
            logger.warning('Bollinger alert Telegram notification was not sent for %s', alert['symbol'])

    async def notify_signal(self, signal: dict):
        """Send a confirmed Bollinger MTF signal through the Telegram client."""
        if signal.get('timeframe') not in ('5m', '15m/5m'):
            logger.warning('Ignoring Bollinger signal on unsupported timeframe: %s', signal.get('timeframe'))
            return
        dt_str = datetime.utcfromtimestamp(signal["timestamp"]).strftime('%Y-%m-%d %H:%M:%S UTC')
        direction_emoji = "🟢" if signal["direction"] == "BUY" else "🔴"

        msg = (
            f"🚨 <b>SIGNAL CONFIRMED</b> 🚨\n\n"
            f"• <b>Strategy:</b> {signal['strategy']}\n"
            f"• <b>Symbol:</b> <code>{signal['symbol']}</code>\n"
            f"• <b>Direction:</b> {direction_emoji} <b>{signal['direction']}</b>\n"
            f"• <b>Timeframe:</b> <code>{signal['timeframe']}</code>\n"
            f"• <b>Time:</b> <code>{dt_str}</code>\n"
            f"• <b>Entry Reference:</b> <code>{signal['entry']}</code>\n"
            f"• <b>Stop Loss:</b> <code>{signal['stop_loss']}</code>\n"
            f"• <b>Target:</b> <code>{signal['target']}</code>\n"
        )
        sent = await telegram_client.send_message(msg)
        if not sent:
            logger.warning('Bollinger signal Telegram notification was not sent for %s', signal.get('symbol'))

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

# Global strategy instance
bb_strategy = BollingerBandsStrategy()
