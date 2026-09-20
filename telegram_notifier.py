"""
Telegram notifier module - consolidated into app.py.
Re-exports for backwards compatibility.
"""
from app import (
    get_telegram_config,
    format_trade_caption,
    send_telegram_trade,
    test_telegram_connection,
)
