# 🎯 Trading Performance Tracker ($10 ➔ $100)

A high-performance trading journal and analytics web application specifically built to track your journey growing a **$10 account to $100** while strictly enforcing your trading rules.

---

## ⚡ Core Features

- 🎯 **Target Goal Tracking ($10 ➔ $100):** Real-time balance updates, percentage gain counter, remaining milestone calculation, and an animated progress bar.
- 🛡️ **Golden Trading Rules Checklist & Daily Limit:**
  1. **Look HTF 4H:** High Timeframe 4-Hour trend and key level confirmation.
  2. **Switch to 3m or 5m Entry:** Lower Timeframe precise entry triggers.
  3. **Risk 1% Per Trade:** Strict risk management adherence.
  4. **Max 2 Setups Per Day:** Active daily setup counter (0/2, 1/2, 2/2) with visual alert to prevent overtrading.
- 📈 **Interactive Charts:**
  - **Equity Line Chart:** Visualizes account growth progression against the $100 target threshold.
  - **Performance Cycle / Donut Chart:** Win vs Loss vs Break-Even breakdown with live Win Rate %.
- 📸 **Trade Journal & Screenshot Proof:**
  - Log pair (e.g. `XAUUSD`, `EURUSD`, `BTCUSDT`), direction (Long/Short), date/time, PnL, rules followed, and notes.
  - Upload chart screenshots and preview them in a full-screen lightbox modal.
- ✈️ **Automated Telegram Bot Alerts:**
  - Automatically posts every trade entry with formatted emojis, stats, rule compliance, and uploads the chart screenshot directly to your Telegram chat.
  - "Test Telegram" button directly in the navbar to verify connection.
- 🐘 **Render PostgreSQL Database Support:**
  - Production-ready for Render's managed PostgreSQL database via `DATABASE_URL`.
  - Automatic local fallback to SQLite (`trading_tracker.db`) when running locally.

---

## 🚀 Quick Start (Local Setup)

### 1. Install Dependencies
Make sure you have Python 3.10+ installed:
```powershell
pip install -r requirements.txt
```

### 2. Configure Environment (.env)
Edit `.env` or leave default for local SQLite:
```env
# Optional: Set to Render PostgreSQL URL or leave empty for local SQLite
DATABASE_URL=

# Telegram Bot Integration (Optional but recommended)
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Account Target Settings
INITIAL_BALANCE=10.0
TARGET_BALANCE=100.0
MAX_DAILY_SETUPS=2
```

### 3. Start the Web Server
```powershell
python main.py
```
*Or using uvicorn directly:*
```powershell
uvicorn main:app --reload --port 8000
```

Open your browser and navigate to:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🤖 Setting Up Telegram Bot Alerts

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot` and follow instructions to name your bot.
3. Copy the **HTTP API Token** provided by BotFather into `TELEGRAM_BOT_TOKEN` in `.env`.
4. Search for **[@userinfobot](https://t.me/userinfobot)** on Telegram and start it to get your numeric **Id** (Chat ID).
5. Put that ID into `TELEGRAM_CHAT_ID` in `.env`.
6. Start a chat with your new bot (press "Start").
7. Click the **"Test Telegram"** button in the web app navigation bar to confirm!

---

## ☁️ Deploying to Render with PostgreSQL

This project includes [`render.yaml`](render.yaml) for 1-click Blueprint deployment.

### Option A: Using render.yaml (Blueprint)
1. Push this folder to a GitHub repository.
2. Log into [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** ➔ **Blueprint**.
4. Connect your GitHub repository. Render will automatically spin up:
   - A free **PostgreSQL Database** (`trading-db`)
   - A Python **Web Service** running FastAPI with automatic connection strings.
5. In your Render Web Service settings, add the environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

### Option B: Manual Setup on Render
1. Create a **PostgreSQL** database on Render.
2. Create a **Web Service** connected to your repository:
   - **Environment:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Under **Environment Variables**, add:
   - `DATABASE_URL`: Your Render PostgreSQL Internal Database URL
   - `TELEGRAM_BOT_TOKEN`: Your bot token
   - `TELEGRAM_CHAT_ID`: Your chat ID
   - `INITIAL_BALANCE`: `10.0`
   - `TARGET_BALANCE`: `100.0`
   - `MAX_DAILY_SETUPS`: `2`

---

## 📁 Project Structure

```
tracking-performent/
├── main.py               # FastAPI backend with trade endpoints & uploads
├── database.py           # SQLAlchemy DB setup (Render Postgres + SQLite)
├── models.py             # Database models for trades & rules
├── telegram_notifier.py  # Telegram bot client for text & photo alerts
├── requirements.txt      # Python dependencies
├── render.yaml           # Render blueprint for web service + PostgreSQL
├── Procfile              # Web service runner command
├── .env.example          # Sample environment configuration
├── .gitignore            # Git ignore rules
├── static/
│   ├── index.html        # Dashboard UI (Dark mode, TradingView style)
│   ├── css/style.css     # Custom animations & scrollbars
│   └── js/app.js         # Chart.js rendering, API calls & modals
└── uploads/              # Local chart screenshots storage
```
