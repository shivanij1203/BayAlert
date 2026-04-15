"""
Prediction service that loads trained ML models and runs inference
on live data from TimescaleDB.
"""

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

ML_DIR = Path(__file__).parent.parent.parent.parent / "ml"


def get_recent_readings(db: Session, station_id: str, hours: int = 24) -> pd.DataFrame:
    """Pull recent readings from TimescaleDB and pivot into a feature-ready format."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    rows = db.execute(
        text("""
            SELECT parameter, value, recorded_at
            FROM readings
            WHERE station_id = :sid AND recorded_at > :since
            ORDER BY recorded_at ASC
        """),
        {"sid": station_id, "since": since},
    ).fetchall()

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=["parameter", "value", "recorded_at"])
    df["recorded_at"] = pd.to_datetime(df["recorded_at"], utc=True)

    pivoted = df.pivot_table(
        index="recorded_at",
        columns="parameter",
        values="value",
        aggfunc="mean",
    )

    pivoted = pivoted.resample("15min").mean()
    pivoted = pivoted.ffill(limit=4)

    return pivoted


def run_anomaly_detection(db: Session, station_id: str, parameter: str = "conductance"):
    """
    Run the trained Isolation Forest on recent data for a station.
    Returns list of detected anomaly timestamps + scores.
    """
    import sys
    sys.path.insert(0, str(ML_DIR.parent))

    from ml.anomaly_detector import WaterQualityAnomalyDetector
    from ml.features import build_feature_matrix

    detector = WaterQualityAnomalyDetector()
    try:
        detector.load(f"anomaly_{parameter}")
    except FileNotFoundError:
        logger.warning(f"no trained model found for anomaly_{parameter}")
        return []

    pivoted = get_recent_readings(db, station_id, hours=48)
    if pivoted.empty or parameter not in pivoted.columns:
        return []

    features = build_feature_matrix(pivoted, target_col=parameter)
    if features.empty:
        return []

    results = detector.predict(features)
    anomalies = results[results["is_anomaly"]]

    return [
        {
            "timestamp": ts.isoformat(),
            "value": float(row[parameter]),
            "anomaly_score": float(row["anomaly_score"]),
        }
        for ts, row in anomalies.iterrows()
    ]


def run_forecast(db: Session, station_id: str, parameter: str = "turbidity"):
    """
    Run the trained XGBoost forecaster to predict value 2 hours from now.
    Returns the predicted value and confidence interval.
    """
    import sys
    sys.path.insert(0, str(ML_DIR.parent))

    from ml.forecaster import WaterQualityForecaster
    from ml.features import build_feature_matrix

    forecaster = WaterQualityForecaster(target_col=parameter)
    try:
        forecaster.load()
    except FileNotFoundError:
        logger.warning(f"no trained model found for forecaster_{parameter}")
        return None

    pivoted = get_recent_readings(db, station_id, hours=48)
    if pivoted.empty or parameter not in pivoted.columns:
        return None

    features = build_feature_matrix(pivoted, target_col=parameter)
    if features.empty:
        return None

    # predict on the last row (most recent data point)
    last_row = features.iloc[[-1]]
    prediction = forecaster.predict(last_row)[0]

    # current value for comparison
    current = float(features[parameter].iloc[-1])

    return {
        "parameter": parameter,
        "current_value": round(current, 2),
        "predicted_value": round(float(prediction), 2),
        "forecast_minutes": forecaster.horizon * 15,
        "forecast_time": (
            datetime.now(timezone.utc) + timedelta(minutes=forecaster.horizon * 15)
        ).isoformat(),
        "direction": "rising" if prediction > current else "falling",
        "change_pct": round(((prediction - current) / current) * 100, 2) if current != 0 else 0,
    }
