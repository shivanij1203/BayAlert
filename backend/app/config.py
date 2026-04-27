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

    # NOAA CO-OPS tide stations near Tampa Bay
    # station metadata: https://tidesandcurrents.noaa.gov/stations.html
    noaa_tide_stations: list[tuple[str, str]] = [
        ("8726520", "St. Petersburg"),
        ("8726607", "Old Port Tampa"),
        ("8726724", "Clearwater Beach"),
    ]

    # NWS gridpoints (lat, lon, label) for weather near each watershed
    # API: https://api.weather.gov/points/{lat},{lon}
    nws_points: list[tuple[float, float, str]] = [
        (27.87, -82.21, "Alafia Upstream (Lithia)"),
        (27.95, -82.46, "Tampa Downtown"),
        (27.48, -82.35, "Manatee Watershed (Rye)"),
    ]

    # user-agent for NWS (required by their API policy)
    nws_user_agent: str = os.getenv(
        "NWS_USER_AGENT",
        "BayAlert/0.1 (shivanijagannatham@gmail.com)",
    )

    # notification delivery
    webhook_url: str | None = os.getenv("BAYALERT_WEBHOOK_URL")
    webhook_timeout_s: float = 10.0

    smtp_host: str | None = os.getenv("SMTP_HOST")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str | None = os.getenv("SMTP_USER")
    smtp_password: str | None = os.getenv("SMTP_PASSWORD")
    smtp_from: str = os.getenv("SMTP_FROM", "bayalert@example.com")
    smtp_to: list[str] = [
        addr.strip() for addr in os.getenv("SMTP_TO", "").split(",") if addr.strip()
    ]

    # escalate a critical alert if un-acked for this many minutes
    escalation_grace_minutes: int = 10

    class Config:
        env_file = ".env"


settings = Settings()
