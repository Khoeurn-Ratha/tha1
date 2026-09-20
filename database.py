"""
Database module - consolidated into app.py.
Re-exports for backwards compatibility.
"""
from app import engine, SessionLocal, Base, get_db, DATABASE_URL
