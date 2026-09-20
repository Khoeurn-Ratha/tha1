"""
Trade Performance Tracker ($10 to $100)
Consolidated into app.py. This file re-exports everything for backwards compatibility.
"""
from app import (
    app,
    Base,
    engine,
    get_db,
    Trade,
    format_trade_caption,
    send_telegram_trade,
    test_telegram_connection,
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
