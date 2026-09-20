@echo off
echo ===================================================
echo   Starting Trading Performance Tracker ($10 to $100)
echo   Dashboard: http://localhost:8000
echo ===================================================
py -m uvicorn app:app --reload --port 8000
pause
