from sqlalchemy import Column, String, Float, DateTime, BigInteger, Enum
import enum

from app.database import Base


class AlertLevel(str, enum.Enum):
    WARNING = "warning"
    CRITICAL = "critical"


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

    def __repr__(self):
        return f"<Alert [{self.level}] {self.station_name} | {self.parameter}={self.value}>"
