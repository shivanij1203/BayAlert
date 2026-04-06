from sqlalchemy import Column, String, Float, DateTime, BigInteger, Index
from app.database import Base


class Reading(Base):
    """
    Stores individual sensor readings from USGS monitoring stations.
    This table is converted to a TimescaleDB hypertable partitioned by recorded_at.
    """
    __tablename__ = "readings"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    station_id = Column(String(20), nullable=False)
    station_name = Column(String(200), nullable=False)
    parameter = Column(String(50), nullable=False)
    value = Column(Float, nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    ingested_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_station_param_time", "station_id", "parameter", "recorded_at"),
    )

    def __repr__(self):
        return f"<Reading {self.station_name} | {self.parameter}={self.value} @ {self.recorded_at}>"
