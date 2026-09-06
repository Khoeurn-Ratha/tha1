import os
import requests
from dotenv import load_dotenv

load_dotenv()


def get_telegram_config():
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    return token, chat_id


def format_trade_caption(trade: dict, current_balance: float, target_balance: float = 100.0) -> str:
    direction_emoji = "🟢 LONG" if trade.get("direction") == "LONG" else "🔴 SHORT"
    pnl = trade.get("pnl", 0.0)
    pnl_sign = "+" if pnl > 0 else ""
    pnl_emoji = "🚀 WIN" if pnl > 0 else ("🔻 LOSS" if pnl < 0 else "⚪ BE")

    htf_icon = "✅" if trade.get("rule_htf_4h") else "❌"
    ltf_icon = "✅" if trade.get("rule_ltf_entry") else "❌"
    risk_icon = "✅" if trade.get("rule_risk_1pct") else "❌"

    progress = max(0, min(100, round(((current_balance - 10.0) / (target_balance - 10.0)) * 100, 1))) if target_balance > 10 else 0

    text = (
        f"📊 <b>NEW TRADE LOGGED</b> ({pnl_emoji})\n\n"
        f"🔹 <b>Pair:</b> {trade.get('pair')} | {direction_emoji}\n"
        f"🔹 <b>Date:</b> {trade.get('trade_date', '')}\n"
        f"🔹 <b>PnL:</b> <code>{pnl_sign}${pnl:.2f}</code>\n"
        f"🔹 <b>Account Balance:</b> <code>${current_balance:.2f}</code>\n"
        f"🎯 <b>Target ($10 ➔ $100):</b> {progress}% reached\n\n"
        f"🛡️ <b>Trading Rules Checklist:</b>\n"
        f"  {htf_icon} <b>HTF 4H Checked:</b> {'YES' if trade.get('rule_htf_4h') else 'NO'}\n"
        f"  {ltf_icon} <b>3m/5m Entry Switch:</b> {'YES' if trade.get('rule_ltf_entry') else 'NO'}\n"
        f"  {risk_icon} <b>1% Risk Followed:</b> {'YES' if trade.get('rule_risk_1pct') else 'NO'}\n"
        f"  ⚡ <b>Setup Today:</b> {trade.get('setup_number', 1)} / 2\n"
    )

    if trade.get("notes"):
        text += f"\n📝 <b>Notes:</b> {trade.get('notes')}"

    return text


def send_telegram_trade(trade: dict, current_balance: float, target_balance: float = 100.0, photo_path: str = None) -> dict:
    token, chat_id = get_telegram_config()
    if not token or not chat_id:
        return {"success": False, "message": "Telegram Bot Token or Chat ID is not configured."}

    caption = format_trade_caption(trade, current_balance, target_balance)

    try:
        if photo_path and os.path.exists(photo_path):
            url = f"https://api.telegram.org/bot{token}/sendPhoto"
            with open(photo_path, "rb") as photo_file:
                # Telegram caption max length is 1024 characters
                safe_caption = caption[:1020] + "..." if len(caption) > 1024 else caption
                response = requests.post(
                    url,
                    data={"chat_id": chat_id, "caption": safe_caption, "parse_mode": "HTML"},
                    files={"photo": photo_file},
                    timeout=15
                )
        else:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            response = requests.post(
                url,
                json={"chat_id": chat_id, "text": caption, "parse_mode": "HTML"},
                timeout=15
            )

        res_json = response.json()
        if response.status_code == 200 and res_json.get("ok"):
            return {"success": True, "message": "Telegram notification sent successfully."}
        else:
            return {"success": False, "message": f"Telegram API error: {res_json.get('description', 'Unknown')}"}
    except Exception as e:
        return {"success": False, "message": f"Failed to send to Telegram: {str(e)}"}


def test_telegram_connection() -> dict:
    token, chat_id = get_telegram_config()
    if not token or not chat_id:
        return {"success": False, "message": "Telegram Bot Token or Chat ID not configured in .env"}

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    message = (
        "🚀 <b>Trading Performance Tracker Connected!</b>\n\n"
        "Your Telegram notifications are working. Every time you log a trade with your rules (4H HTF, 3m/5m entry, 1% risk, 2 setups max), "
        "it will be sent here automatically with your screenshot! 📈🎯"
    )
    try:
        response = requests.post(
            url,
            json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
            timeout=10
        )
        res_json = response.json()
        if response.status_code == 200 and res_json.get("ok"):
            return {"success": True, "message": "Test message sent to Telegram successfully!"}
        else:
            return {"success": False, "message": f"Telegram error: {res_json.get('description', 'Unknown error')}"}
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {str(e)}"}
