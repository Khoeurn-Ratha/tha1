import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from database import Base


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    pair = Column(String(50), nullable=False, index=True)
    direction = Column(String(10), nullable=False)  # 'LONG' or 'SHORT'
    trade_date = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
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

    created_at = Column(DateTime, default=datetime.datetime.utcnow)

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
