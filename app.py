import os
import shutil
import uuid
import secrets
from datetime import datetime, date, timedelta
from typing import Optional, Dict

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, Text, desc, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Load environment variables
load_dotenv()

# ================= DATABASE CONFIGURATION =================
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./trading_tracker.db"

# Render provides postgres:// URLs, but SQLAlchemy 1.4+ requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite multithreading support
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ================= DATABASE MODELS =================
class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    pair = Column(String(50), nullable=False, index=True)
    direction = Column(String(10), nullable=False)  # 'LONG' or 'SHORT'
    trade_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    pnl = Column(Float, nullable=False)  # Profit or Loss in $
    pnl_percentage = Column(Float, nullable=True)  # Percentage return

    # Trading Rules Checklist
    rule_htf_4h = Column(Boolean, default=True)  # Checked 4H HTF
    rule_ltf_entry = Column(Boolean, default=True)  # Checked 3m/5m entry
    rule_risk_1pct = Column(Boolean, default=True)  # Risk 1% maintained
    setup_number = Column(Integer, default=1)  # 1 or 2 for the day

    # Attachments & Rationale
    image_url = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    # Balance state tracking
    running_balance = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "pair": self.pair,
            "direction": self.direction,
            "trade_date": self.trade_date.isoformat() if self.trade_date else None,
            "pnl": round(self.pnl, 2),
            "pnl_percentage": round(self.pnl_percentage, 2) if self.pnl_percentage is not None else None,
            "rule_htf_4h": bool(self.rule_htf_4h),
            "rule_ltf_entry": bool(self.rule_ltf_entry),
            "rule_risk_1pct": bool(self.rule_risk_1pct),
            "setup_number": self.setup_number,
            "image_url": self.image_url,
            "notes": self.notes,
            "running_balance": round(self.running_balance, 2) if self.running_balance is not None else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# Create tables
Base.metadata.create_all(bind=engine)


# ================= TELEGRAM NOTIFIER =================
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


# ================= FASTAPI APPLICATION =================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

app = FastAPI(title="Trade Performance Tracker", version="2.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount statics
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# In-memory session tokens: {token: {"username": str, "role": str, "expires": datetime}}
ACTIVE_TOKENS: Dict[str, dict] = {}

# User authentication credentials
CREDENTIALS = {
    "admin": {
        "passwords": ["Ratha123"],
        "aliases": ["admin", "ratha"],
        "role": "admin",
        "displayName": "Ratha (Admin)"
    },
    "user": {
        "passwords": ["user123"],
        "aliases": ["user", "guest", "viewer"],
        "role": "user",
        "displayName": "Viewer (Read-Only)"
    }
}


class LoginRequest(BaseModel):
    username: str
    password: str


def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization:
        return None
    
    token = authorization
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    session = ACTIVE_TOKENS.get(token)
    if not session:
        return None

    if datetime.utcnow() > session["expires"]:
        del ACTIVE_TOKENS[token]
        return None

    return session


def require_admin(user: Optional[dict] = Depends(get_current_user)):
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in as Admin."
        )
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied. Only Admin can modify trades or settings."
        )
    return user


@app.get("/")
def read_root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Trade Performance Tracker API is running. UI not found."}


# ---------------- AUTH ENDPOINTS ----------------

@app.post("/api/login")
def login(creds: LoginRequest):
    uname = creds.username.strip().lower()
    pwd = creds.password.strip()

    matched_role = None
    display_name = uname

    # Check Admin
    if uname in CREDENTIALS["admin"]["aliases"] and pwd in CREDENTIALS["admin"]["passwords"]:
        matched_role = "admin"
        display_name = "Ratha (Admin)"
    # Check Viewer
    elif uname in CREDENTIALS["user"]["aliases"] and pwd in CREDENTIALS["user"]["passwords"]:
        matched_role = "user"
        display_name = "Viewer (Read-Only)"

    if not matched_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password."
        )

    # Generate session token (valid 30 days)
    token = secrets.token_hex(32)
    ACTIVE_TOKENS[token] = {
        "username": uname,
        "displayName": display_name,
        "role": matched_role,
        "expires": datetime.utcnow() + timedelta(days=30)
    }

    return {
        "success": True,
        "token": token,
        "role": matched_role,
        "displayName": display_name,
        "username": uname
    }


@app.get("/api/me")
def get_me(user: Optional[dict] = Depends(get_current_user)):
    if not user:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "username": user["username"],
        "displayName": user["displayName"],
        "role": user["role"]
    }


@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        ACTIVE_TOKENS.pop(token, None)
    return {"success": True}


# ---------------- TRADE ENDPOINTS ----------------

@app.get("/api/trades")
def get_trades(db: Session = Depends(get_db)):
    trades = db.query(Trade).order_by(Trade.trade_date.asc(), Trade.id.asc()).all()

    initial_balance = float(os.getenv("INITIAL_BALANCE", 10.0))
    target_balance = float(os.getenv("TARGET_BALANCE", 100.0))

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

        d_label = t.trade_date.strftime("%b %d %H:%M") if t.trade_date else f"Trade #{t.id}"
        balance_history.append({
            "date": d_label,
            "balance": round(current_bal, 2),
            "pnl": round(t.pnl, 2),
            "pair": t.pair,
            "direction": t.direction
        })

    # Return newest first for journal table
    table_trades = list(reversed(trade_list))

    total_trades = len(trades)
    total_pnl = round(current_bal - initial_balance, 2)
    win_rate = round((wins / total_trades * 100), 1) if total_trades > 0 else 0.0
    progress_pct = max(0, min(100, round(((current_bal - initial_balance) / (target_balance - initial_balance)) * 100, 1))) if target_balance > initial_balance else 0

    # Calculate gross wins and gross losses for profit factor
    gross_wins = sum(t.pnl for t in trades if t.pnl > 0)
    gross_losses = abs(sum(t.pnl for t in trades if t.pnl < 0))
    profit_factor = round(gross_wins / gross_losses, 2) if gross_losses > 0 else (round(gross_wins, 2) if gross_wins > 0 else 0.0)

    # Real adherence percentages (0% if no trades yet, instead of fake 100%)
    htf_pct = round((rule_htf_count / total_trades * 100), 1) if total_trades > 0 else 0.0
    ltf_pct = round((rule_ltf_count / total_trades * 100), 1) if total_trades > 0 else 0.0
    risk_pct = round((rule_risk_count / total_trades * 100), 1) if total_trades > 0 else 0.0

    return {
        "trades": table_trades,
        "balance_history": balance_history,
        "stats": {
            "initial_balance": initial_balance,
            "target_balance": target_balance,
            "current_balance": round(current_bal, 2),
            "total_pnl": total_pnl,
            "progress_pct": progress_pct,
            "total_trades": total_trades,
            "wins": wins,
            "losses": losses,
            "breakeven": breakeven,
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "today_setups": today_setups_count,
            "max_daily_setups": int(os.getenv("MAX_DAILY_SETUPS", 2)),
            "rule_adherence": {
                "htf_4h_pct": htf_pct,
                "ltf_entry_pct": ltf_pct,
                "risk_1pct_pct": risk_pct,
            }
        }
    }


# CREATE TRADE (Admin Only)
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
    admin_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    parsed_date = datetime.utcnow()
    if trade_date:
        try:
            parsed_date = datetime.fromisoformat(trade_date)
        except Exception:
            parsed_date = datetime.utcnow()

    # Save screenshot
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

    # Calculate balance
    initial_balance = float(os.getenv("INITIAL_BALANCE", 10.0))
    target_balance = float(os.getenv("TARGET_BALANCE", 100.0))
    total_existing_pnl = db.query(func.sum(Trade.pnl)).scalar() or 0.0
    new_running_balance = initial_balance + total_existing_pnl + pnl

    trade = Trade(
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

    # Telegram notification
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


# EDIT TRADE (Admin Only)
@app.put("/api/trades/{trade_id}")
async def edit_trade(
    trade_id: int,
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
    admin_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    parsed_date = trade.trade_date
    if trade_date:
        try:
            parsed_date = datetime.fromisoformat(trade_date)
        except Exception:
            pass

    # If new image provided, update image
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1].lower()
        if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
            ext = ".png"
        unique_filename = f"{uuid.uuid4().hex}{ext}"
        saved_file_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(saved_file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        # Remove old image
        if trade.image_url:
            old_filename = os.path.basename(trade.image_url)
            old_path = os.path.join(UPLOAD_DIR, old_filename)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass

        trade.image_url = f"/uploads/{unique_filename}"

    # Update trade attributes
    trade.pair = pair.strip().upper()
    trade.direction = direction.strip().upper()
    trade.trade_date = parsed_date
    trade.pnl = pnl
    trade.rule_htf_4h = rule_htf_4h
    trade.rule_ltf_entry = rule_ltf_entry
    trade.rule_risk_1pct = rule_risk_1pct
    trade.setup_number = setup_number
    trade.notes = notes.strip() if notes else None

    db.commit()
    db.refresh(trade)

    return {
        "success": True,
        "message": f"Trade #{trade_id} updated successfully.",
        "trade": trade.to_dict()
    }


# DELETE TRADE (Admin Only)
@app.delete("/api/trades/{trade_id}")
def delete_trade(
    trade_id: int,
    admin_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

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


# TEST TELEGRAM (Admin Only)
@app.post("/api/test-telegram")
def api_test_telegram(admin_user: dict = Depends(require_admin)):
    result = test_telegram_connection()
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
