import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://bayalert:bayalert_dev@localhost:5432/bayalert",
    )
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # USGS stations in the Tampa Bay watershed
    usgs_stations: list[str] = [
        "023000095",  # Manatee River at Rye
        "02301721",   # Alafia River at Gibsonton
        "02301718",   # Alafia River at Riverview
        "02306028",   # Hillsborough River at Tampa
        "02301500",   # Alafia River at Lithia (has turbidity)
    ]

    # USGS parameter codes
    usgs_parameters: list[str] = [
        "00095",  # specific conductance (salinity proxy)
        "63680",  # turbidity
        "00010",  # water temperature
        "00300",  # dissolved oxygen
    ]

    # alert thresholds
    turbidity_warning: float = 15.0   # FNU
    turbidity_critical: float = 40.0  # FNU
    conductance_spike_pct: float = 20.0  # % change from rolling mean

    class Config:
        env_file = ".env"


settings = Settings()
