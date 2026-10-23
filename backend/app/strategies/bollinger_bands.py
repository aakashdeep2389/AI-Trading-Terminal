import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime

from app.engine.indicators import bollinger_bands
from app.integrations.telegram import telegram_client

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

        # Check for new 5m Sell Alert (high < upper_band, touching is invalid)
        # Only set if not already awaiting confirmation, AND we didn't just confirm a signal on this candle
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

        # Check for new 15m Buy Alert (low > lower_band, touching is invalid)
        if lower[-1] is not None:
            if last_candle.low > lower[-1]:
                self.buy_alerts[symbol] = BuyAlertState(
                    symbol=symbol,
                    alert_candle_time=last_candle.time,
                    alert_candle_high=last_candle.high,
                    alert_candle_low=last_candle.low
                )

        return None

    async def notify_signal(self, signal: dict):
        """
        Sends formatted Telegram notification for a confirmed signal using HTML formatting.
        """
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
        await telegram_client.send_message(msg)

# Global strategy instance
bb_strategy = BollingerBandsStrategy()
