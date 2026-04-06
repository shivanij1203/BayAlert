"""
REST endpoints for sensor readings.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db

router = APIRouter(prefix="/api/readings", tags=["readings"])


@router.get("/latest")
def get_latest_readings(db: Session = Depends(get_db)):
    """Get the most recent reading for each station + parameter combo."""
    rows = db.execute(
        text("""
            SELECT DISTINCT ON (station_id, parameter)
                station_id, station_name, parameter, value, recorded_at
            FROM readings
            ORDER BY station_id, parameter, recorded_at DESC
        """)
    ).fetchall()

    return [
        {
            "station_id": r.station_id,
            "station_name": r.station_name,
            "parameter": r.parameter,
            "value": r.value,
            "recorded_at": r.recorded_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/history/{station_id}")
def get_station_history(
    station_id: str,
    parameter: str = Query(default="specific_conductance"),
    hours: int = Query(default=24, le=720),
    db: Session = Depends(get_db),
):
    """Get time-series data for a station over the specified number of hours."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    rows = db.execute(
        text("""
            SELECT value, recorded_at
            FROM readings
            WHERE station_id = :sid AND parameter = :param AND recorded_at > :since
            ORDER BY recorded_at ASC
        """),
        {"sid": station_id, "param": parameter, "since": since},
    ).fetchall()

    return {
        "station_id": station_id,
        "parameter": parameter,
        "hours": hours,
        "count": len(rows),
        "data": [
            {"value": r.value, "recorded_at": r.recorded_at.isoformat()}
            for r in rows
        ],
    }


@router.get("/stations")
def list_stations(db: Session = Depends(get_db)):
    """List all stations that have data."""
    rows = db.execute(
        text("""
            SELECT station_id, station_name, COUNT(*) as reading_count,
                   MIN(recorded_at) as first_reading, MAX(recorded_at) as last_reading
            FROM readings
            GROUP BY station_id, station_name
            ORDER BY station_name
        """)
    ).fetchall()

    return [
        {
            "station_id": r.station_id,
            "station_name": r.station_name,
            "reading_count": r.reading_count,
            "first_reading": r.first_reading.isoformat(),
            "last_reading": r.last_reading.isoformat(),
        }
        for r in rows
    ]
