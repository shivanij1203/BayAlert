from sqlalchemy import Column, String, Float, DateTime, Index

from app.database import Base


class EnvironmentalReading(Base):
    """
    Weather + tide readings from NOAA that contextualize USGS sensor data.

    Sources:
    - "tide"    → NOAA CO-OPS (water_level, water_temperature, wind)
    - "weather" → NOAA NWS gridpoint forecast (precipitation_rate,
                  precipitation_prob, wind_speed, temperature)

    TimescaleDB hypertable partitioned by recorded_at.
    """
    __tablename__ = "environmental_readings"

    recorded_at = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    source = Column(String(20), primary_key=True, nullable=False)
    station_id = Column(String(40), primary_key=True, nullable=False)
    parameter = Column(String(50), primary_key=True, nullable=False)
    value = Column(Float, nullable=False)
    station_name = Column(String(200), nullable=False)
    ingested_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_env_source_param_time", "source", "parameter", "recorded_at"),
        Index("ix_env_station_param_time", "station_id", "parameter", "recorded_at"),
    )

    def __repr__(self) -> str:
        return f"<EnvReading {self.source}:{self.station_name} {self.parameter}={self.value} @ {self.recorded_at}>"
