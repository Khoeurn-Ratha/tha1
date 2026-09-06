import os
import shutil
import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from database import engine, Base, get_db
import models
from telegram_notifier import send_telegram_trade, test_telegram_connection

# Create tables
Base.metadata.create_all(bind=engine)

# Ensure upload directory exists
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="Trade Performance Tracker", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static and Upload mounts
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def read_root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Trade Performance Tracker API is running. UI not found."}


@app.get("/api/trades")
def get_trades(db: Session = Depends(get_db)):
    trades = db.query(models.Trade).order_by(models.Trade.trade_date.asc(), models.Trade.id.asc()).all()

    initial_balance = float(os.getenv("INITIAL_BALANCE", 10.0))
    target_balance = float(os.getenv("TARGET_BALANCE", 100.0))

    # Recalculate running balance in order
    current_bal = initial_balance
    balance_history = [{"date": "Start", "balance": round(initial_balance, 2), "pnl": 0.0, "label": "Start ($10)"}]

    trade_list = []
    wins = 0
    losses = 0
    breakeven = 0
    today_str = date.today().isoformat()
    today_setups_count = 0

    rule_htf_count = 0
    rule_ltf_count = 0
    rule_risk_count = 0

    for t in trades:
        current_bal += t.pnl
        if t.pnl > 0.0001:
            wins += 1
        elif t.pnl < -0.0001:
            losses += 1
        else:
            breakeven += 1

        if t.rule_htf_4h:
            rule_htf_count += 1
        if t.rule_ltf_entry:
            rule_ltf_count += 1
        if t.rule_risk_1pct:
            rule_risk_count += 1

        t_date_str = t.trade_date.date().isoformat() if t.trade_date else ""
        if t_date_str == today_str:
            today_setups_count += 1

        d = t.to_dict()
        d["running_balance"] = round(current_bal, 2)
        trade_list.append(d)

        # Append to chart curve
        d_label = t.trade_date.strftime("%b %d %H:%M") if t.trade_date else f"Trade #{t.id}"
        balance_history.append({
            "date": d_label,
            "balance": round(current_bal, 2),
            "pnl": round(t.pnl, 2),
            "pair": t.pair,
            "direction": t.direction
        })

    # Return newest trades first for the table display
    table_trades = list(reversed(trade_list))

    total_trades = len(trades)
    win_rate = round((wins / total_trades * 100), 1) if total_trades > 0 else 0.0
    progress_pct = max(0, min(100, round(((current_bal - initial_balance) / (target_balance - initial_balance)) * 100, 1))) if target_balance > initial_balance else 0

    return {
        "trades": table_trades,
        "balance_history": balance_history,
        "stats": {
            "initial_balance": initial_balance,
            "target_balance": target_balance,
            "current_balance": round(current_bal, 2),
            "progress_pct": progress_pct,
            "total_trades": total_trades,
            "wins": wins,
            "losses": losses,
            "breakeven": breakeven,
            "win_rate": win_rate,
            "today_setups": today_setups_count,
            "max_daily_setups": int(os.getenv("MAX_DAILY_SETUPS", 2)),
            "rule_adherence": {
                "htf_4h_pct": round((rule_htf_count / total_trades * 100), 1) if total_trades > 0 else 100,
                "ltf_entry_pct": round((rule_ltf_count / total_trades * 100), 1) if total_trades > 0 else 100,
                "risk_1pct_pct": round((rule_risk_count / total_trades * 100), 1) if total_trades > 0 else 100,
            }
        }
    }


@app.post("/api/trades")
async def create_trade(
    pair: str = Form(...),
    direction: str = Form(...),
    trade_date: Optional[str] = Form(None),
    pnl: float = Form(...),
    rule_htf_4h: bool = Form(True),
    rule_ltf_entry: bool = Form(True),
    rule_risk_1pct: bool = Form(True),
    setup_number: int = Form(1),
    notes: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    # Parse trade_date
    parsed_date = datetime.utcnow()
    if trade_date:
        try:
            parsed_date = datetime.fromisoformat(trade_date)
        except Exception:
            parsed_date = datetime.utcnow()

    # Save screenshot if uploaded
    image_url = None
    saved_file_path = None
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1].lower()
        if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
            ext = ".png"
        unique_filename = f"{uuid.uuid4().hex}{ext}"
        saved_file_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(saved_file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_url = f"/uploads/{unique_filename}"

    # Calculate new running balance
    initial_balance = float(os.getenv("INITIAL_BALANCE", 10.0))
    target_balance = float(os.getenv("TARGET_BALANCE", 100.0))
    total_existing_pnl = db.query(func.sum(models.Trade.pnl)).scalar() or 0.0
    new_running_balance = initial_balance + total_existing_pnl + pnl

    trade = models.Trade(
        pair=pair.strip().upper(),
        direction=direction.strip().upper(),
        trade_date=parsed_date,
        pnl=pnl,
        pnl_percentage=round((pnl / (new_running_balance - pnl)) * 100, 2) if (new_running_balance - pnl) > 0 else 0.0,
        rule_htf_4h=rule_htf_4h,
        rule_ltf_entry=rule_ltf_entry,
        rule_risk_1pct=rule_risk_1pct,
        setup_number=setup_number,
        notes=notes.strip() if notes else None,
        image_url=image_url,
        running_balance=new_running_balance
    )

    db.add(trade)
    db.commit()
    db.refresh(trade)

    trade_dict = trade.to_dict()

    # Send telegram notification in background/inline
    telegram_result = send_telegram_trade(
        trade=trade_dict,
        current_balance=new_running_balance,
        target_balance=target_balance,
        photo_path=saved_file_path
    )

    return {
        "success": True,
        "trade": trade_dict,
        "telegram": telegram_result
    }


@app.delete("/api/trades/{trade_id}")
def delete_trade(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(models.Trade).filter(models.Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    # Optionally delete associated image
    if trade.image_url:
        filename = os.path.basename(trade.image_url)
        filepath = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception:
                pass

    db.delete(trade)
    db.commit()
    return {"success": True, "message": f"Trade #{trade_id} deleted."}


@app.post("/api/test-telegram")
def api_test_telegram():
    result = test_telegram_connection()
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
