"""
NOAA weather + tide ingestion.

Sources:
- NOAA CO-OPS       https://api.tidesandcurrents.noaa.gov/api/prod/datagetter
- NOAA NWS forecast https://api.weather.gov/

Both APIs are public and key-less. NWS requires a descriptive User-Agent.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models.environmental import EnvironmentalReading

logger = logging.getLogger(__name__)

COOPS_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
NWS_BASE = "https://api.weather.gov"

HTTP_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


@dataclass(frozen=True)
class EnvPoint:
    """A single environmental observation ready to be written to the DB."""
    source: str
    station_id: str
    station_name: str
    parameter: str
    value: float
    recorded_at: datetime


def _parse_coops_timestamp(s: str) -> datetime:
    """CO-OPS returns 'YYYY-MM-DD HH:MM' in GMT."""
    return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)


def fetch_tide_latest(station_id: str, station_name: str) -> list[EnvPoint]:
    """Fetch the most recent water level and water temperature for a CO-OPS station."""
    points: list[EnvPoint] = []

    products = [
        ("water_level", "water_level", {"datum": "MLLW"}),
        ("water_temperature", "water_temperature", {}),
    ]

    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for product, parameter, extra in products:
            params = {
                "date": "latest",
                "station": station_id,
                "product": product,
                "time_zone": "gmt",
                "units": "metric",
                "format": "json",
                **extra,
            }
            try:
                r = client.get(COOPS_BASE, params=params)
                r.raise_for_status()
                data = r.json()
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("CO-OPS fetch failed %s/%s: %s", station_id, product, exc)
                continue

            if "error" in data:
                logger.warning("CO-OPS error %s/%s: %s", station_id, product, data["error"])
                continue

            for row in data.get("data", []):
                t = row.get("t")
                v = row.get("v")
                if not t or v in (None, ""):
                    continue
                try:
                    value = float(v)
                except (TypeError, ValueError):
                    continue
                points.append(EnvPoint(
                    source="tide",
                    station_id=station_id,
                    station_name=station_name,
                    parameter=parameter,
                    value=value,
                    recorded_at=_parse_coops_timestamp(t),
                ))

    return points


def _resolve_nws_gridpoint(client: httpx.Client, lat: float, lon: float) -> str | None:
    """Return the `/gridpoints/{office}/{x},{y}` path for a lat/lon, or None."""
    try:
        r = client.get(f"{NWS_BASE}/points/{lat},{lon}")
        r.raise_for_status()
        props = r.json().get("properties", {})
        forecast_url = props.get("forecastHourly")
        return forecast_url
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("NWS gridpoint lookup failed for %s,%s: %s", lat, lon, exc)
        return None


def fetch_weather_for_point(lat: float, lon: float, label: str) -> list[EnvPoint]:
    """
    Fetch the next 24 hours of hourly forecast (precipitation probability,
    precipitation amount, wind speed, temperature) for a gridpoint.
    """
    points: list[EnvPoint] = []
    station_id = f"nws:{lat:.3f},{lon:.3f}"
    headers = {
        "User-Agent": settings.nws_user_agent,
        "Accept": "application/geo+json",
    }

    with httpx.Client(timeout=HTTP_TIMEOUT, headers=headers) as client:
        forecast_url = _resolve_nws_gridpoint(client, lat, lon)
        if not forecast_url:
            return points

        try:
            r = client.get(forecast_url)
            r.raise_for_status()
            periods = r.json().get("properties", {}).get("periods", [])
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("NWS hourly forecast failed %s: %s", label, exc)
            return points

        for period in periods[:24]:  # next 24 hours
            try:
                start = period["startTime"]
                recorded_at = datetime.fromisoformat(start.replace("Z", "+00:00"))
            except (KeyError, ValueError):
                continue

            temp = period.get("temperature")
            if temp is not None:
                # convert F→C if necessary
                unit = (period.get("temperatureUnit") or "F").upper()
                t_c = (float(temp) - 32) * 5.0 / 9.0 if unit == "F" else float(temp)
                points.append(EnvPoint("weather", station_id, label, "temperature", t_c, recorded_at))

            prob = period.get("probabilityOfPrecipitation") or {}
            if prob.get("value") is not None:
                points.append(EnvPoint(
                    "weather", station_id, label, "precipitation_prob",
                    float(prob["value"]), recorded_at,
                ))

            qpf = period.get("quantitativePrecipitation") or {}
            if qpf.get("value") is not None:
                # mm already (unitCode wmoUnit:mm)
                points.append(EnvPoint(
                    "weather", station_id, label, "precipitation_amount",
                    float(qpf["value"]), recorded_at,
                ))

            wind_raw = period.get("windSpeed") or ""
            # e.g. "10 mph" or "5 to 10 mph" — take the upper bound
            digits = [int(s) for s in wind_raw.replace("to", " ").split() if s.isdigit()]
            if digits:
                mph = max(digits)
                kmh = mph * 1.609344
                points.append(EnvPoint("weather", station_id, label, "wind_speed", kmh, recorded_at))

    return points


def store_points(db: Session, points: Iterable[EnvPoint]) -> int:
    """Upsert environmental readings, skipping duplicates on the composite key."""
    now = datetime.now(timezone.utc)
    inserted = 0

    for p in points:
        exists = db.execute(
            text(
                """
                SELECT 1 FROM environmental_readings
                WHERE source = :src AND station_id = :sid
                  AND parameter = :param AND recorded_at = :ts
                LIMIT 1
                """
            ),
            {"src": p.source, "sid": p.station_id, "param": p.parameter, "ts": p.recorded_at},
        ).fetchone()
        if exists:
            continue

        db.add(EnvironmentalReading(
            source=p.source,
            station_id=p.station_id,
            station_name=p.station_name,
            parameter=p.parameter,
            value=p.value,
            recorded_at=p.recorded_at,
            ingested_at=now,
        ))
        inserted += 1

    db.commit()
    return inserted


def run_env_ingestion(db: Session) -> dict[str, int]:
    """Full env pipeline: tide + weather → environmental_readings."""
    all_points: list[EnvPoint] = []

    for station_id, name in settings.noaa_tide_stations:
        all_points.extend(fetch_tide_latest(station_id, name))

    for lat, lon, label in settings.nws_points:
        all_points.extend(fetch_weather_for_point(lat, lon, label))

    inserted = store_points(db, all_points)
    logger.info(
        "env ingestion complete: fetched=%d inserted=%d",
        len(all_points), inserted,
    )
    return {"fetched": len(all_points), "inserted": inserted}
