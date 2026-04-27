from sqlalchemy import Column, String, Float, DateTime, BigInteger, Enum
import enum

from app.database import Base


class AlertLevel(str, enum.Enum):
    WARNING = "warning"
    CRITICAL = "critical"


class AlertFeedback(str, enum.Enum):
    UNKNOWN = "unknown"
    CONFIRMED = "confirmed"
    FALSE_POSITIVE = "false_positive"


class Alert(Base):
    """Stores generated alerts when sensor readings cross thresholds."""
    __tablename__ = "alerts"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    station_id = Column(String(20), nullable=False)
    station_name = Column(String(200), nullable=False)
    parameter = Column(String(50), nullable=False)
    value = Column(Float, nullable=False)
    threshold = Column(Float, nullable=False)
    level = Column(Enum(AlertLevel), nullable=False)
    message = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # operator workflow
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by = Column(String(120), nullable=True)
    notes = Column(String(1000), nullable=True)
    feedback = Column(String(32), nullable=False, default="unknown")

    # delivery / escalation state
    last_delivered_at = Column(DateTime(timezone=True), nullable=True)
    escalated_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Alert [{self.level}] {self.station_name} | {self.parameter}={self.value}>"


class AlertDelivery(Base):
    """Audit log of every outbound notification attempt for an alert."""
    __tablename__ = "alert_deliveries"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    alert_id = Column(BigInteger, nullable=False, index=True)
    channel = Column(String(40), nullable=False)  # webhook | email | sms
    target = Column(String(400), nullable=False)
    status = Column(String(40), nullable=False)   # ok | failed | escalation
    http_status = Column(String(10), nullable=True)
    error = Column(String(500), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=False)
