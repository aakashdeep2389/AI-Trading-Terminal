import httpx
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

class TelegramClient:
    def __init__(self):
        self.bot_token = settings.telegram_bot_token
        self.chat_id = settings.telegram_chat_id
        self.enabled = settings.telegram_enabled
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"
        self.client = httpx.AsyncClient()

    async def send_message(self, text: str, disable_notification: bool = False) -> bool:
        if not self.enabled or not self.bot_token or not self.chat_id:
            logger.debug("Telegram notifications are disabled or not configured.")
            return False

        url = f"{self.base_url}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_notification": disable_notification,
        }

        try:
            response = await self.client.post(url, json=payload, timeout=settings.market_stale_after_seconds)
            response.raise_for_status()  # Raise an exception for 4xx or 5xx status codes
            logger.info(f"Telegram message sent successfully: {text[:50]}...")
            return True
        except httpx.ReadTimeout:
            logger.error("Telegram API call timed out.")
        except httpx.HTTPStatusError as e:
            logger.error(f"Telegram API responded with error {e.response.status_code}: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"An error occurred while requesting Telegram API: {e}")
        except Exception as e:
            logger.error(f"An unexpected error occurred: {e}")
        return False

    async def send_test_message(self) -> bool:
        if not self.enabled:
            logger.info("Telegram is disabled. Cannot send test message.")
            return False
        if not self.bot_token or not self.chat_id:
            logger.warning("Telegram bot token or chat ID is not configured. Cannot send test message.")
            return False

        test_message = "*AI Trading Platform:* Test notification from your backend."
        return await self.send_message(test_message, disable_notification=True)

# Instantiate client for global use
telegram_client = TelegramClient()
