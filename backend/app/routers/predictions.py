"""
REST endpoints for ML predictions — anomaly detection and forecasting.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.predict import run_anomaly_detection, run_forecast

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.get("/anomalies/{station_id}")
def detect_anomalies(
    station_id: str,
    parameter: str = Query(default="conductance"),
    db: Session = Depends(get_db),
):
    """Run anomaly detection on recent readings for a station."""
    anomalies = run_anomaly_detection(db, station_id, parameter)
    return {
        "station_id": station_id,
        "parameter": parameter,
        "anomaly_count": len(anomalies),
        "anomalies": anomalies,
    }


@router.get("/forecast/{station_id}")
def get_forecast(
    station_id: str,
    parameter: str = Query(default="turbidity"),
    db: Session = Depends(get_db),
):
    """Get 2-hour ahead forecast for a station + parameter."""
    result = run_forecast(db, station_id, parameter)
    if result is None:
        return {"station_id": station_id, "error": "insufficient data or model not available"}
    return {"station_id": station_id, **result}
