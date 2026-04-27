"""
Environmental (NOAA weather + tide) read-only API.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/api/environmental", tags=["environmental"])


@router.get("/latest")
def latest_environmental(db: Session = Depends(get_db)):
    """Most recent reading per (source, station_id, parameter)."""
    rows = db.execute(
        text(
            """
            SELECT DISTINCT ON (source, station_id, parameter)
              source, station_id, station_name, parameter, value, recorded_at
            FROM environmental_readings
            ORDER BY source, station_id, parameter, recorded_at DESC
            """
        )
    ).fetchall()

    return [
        {
            "source": r.source,
            "station_id": r.station_id,
            "station_name": r.station_name,
            "parameter": r.parameter,
            "value": r.value,
            "recorded_at": r.recorded_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/history")
def environmental_history(
    source: str = Query(..., description="'tide' or 'weather'"),
    parameter: str = Query(..., description="e.g. water_level, precipitation_amount"),
    station_id: str | None = Query(None),
    hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
):
    """Return recent history for plotting."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    base_sql = """
        SELECT station_id, station_name, value, recorded_at
        FROM environmental_readings
        WHERE source = :src AND parameter = :param AND recorded_at >= :since
    """
    params: dict[str, object] = {"src": source, "param": parameter, "since": since}
    if station_id:
        base_sql += " AND station_id = :sid"
        params["sid"] = station_id
    base_sql += " ORDER BY recorded_at ASC"

    rows = db.execute(text(base_sql), params).fetchall()
    return {
        "source": source,
        "parameter": parameter,
        "hours": hours,
        "data": [
            {
                "station_id": r.station_id,
                "station_name": r.station_name,
                "value": r.value,
                "recorded_at": r.recorded_at.isoformat(),
            }
            for r in rows
        ],
    }


@router.get("/rain-forecast")
def rain_forecast_summary(db: Session = Depends(get_db)):
    """
    Summarize the next-24h precipitation outlook per NWS gridpoint.

    Useful for surfacing "heavy rain upstream → expect turbidity" context.
    """
    rows = db.execute(
        text(
            """
            SELECT station_id, station_name,
                   MAX(value) FILTER (WHERE parameter = 'precipitation_prob')   AS max_prob,
                   SUM(value) FILTER (WHERE parameter = 'precipitation_amount') AS total_mm
            FROM environmental_readings
            WHERE source = 'weather'
              AND recorded_at >= NOW()
              AND recorded_at <= NOW() + INTERVAL '24 hours'
            GROUP BY station_id, station_name
            ORDER BY total_mm DESC NULLS LAST, max_prob DESC NULLS LAST
            """
        )
    ).fetchall()

    return [
        {
            "station_id": r.station_id,
            "station_name": r.station_name,
            "max_precip_prob": r.max_prob,
            "total_precip_mm": float(r.total_mm) if r.total_mm is not None else 0.0,
        }
        for r in rows
    ]
