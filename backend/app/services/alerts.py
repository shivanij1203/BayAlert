"""
Alert service that checks recent readings against thresholds.
When a value crosses a threshold, an alert is created and published to Redis.
"""

import json
import logging
from datetime import datetime, timezone

import redis
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.models.alert import Alert, AlertLevel

logger = logging.getLogger(__name__)

redis_client = redis.from_url(settings.redis_url)

ALERT_CHANNEL = "bayalert:alerts"


def check_turbidity(db: Session):
    """
    Check the latest turbidity readings against warning/critical thresholds.
    Creates alerts for any that exceed limits.
    """
    rows = db.execute(
        text("""
            SELECT station_id, station_name, value, recorded_at
            FROM readings
            WHERE parameter = 'turbidity'
            ORDER BY recorded_at DESC
            LIMIT 50
        """)
    ).fetchall()

    alerts_created = 0

    for row in rows:
        station_id, station_name, value, recorded_at = row

        if value >= settings.turbidity_critical:
            level = AlertLevel.CRITICAL
            threshold = settings.turbidity_critical
            msg = f"CRITICAL: turbidity at {station_name} is {value:.1f} FNU (threshold: {threshold})"
        elif value >= settings.turbidity_warning:
            level = AlertLevel.WARNING
            threshold = settings.turbidity_warning
            msg = f"WARNING: turbidity at {station_name} is {value:.1f} FNU (threshold: {threshold})"
        else:
            continue

        # don't duplicate alerts for same station + time
        existing = db.execute(
            text("""
                SELECT 1 FROM alerts
                WHERE station_id = :sid AND parameter = 'turbidity' AND created_at = :ts
                LIMIT 1
            """),
            {"sid": station_id, "ts": recorded_at},
        ).fetchone()

        if existing:
            continue

        alert = Alert(
            station_id=station_id,
            station_name=station_name,
            parameter="turbidity",
            value=value,
            threshold=threshold,
            level=level,
            message=msg,
            created_at=recorded_at,
        )
        db.add(alert)
        alerts_created += 1

        # publish to Redis for real-time subscribers
        redis_client.publish(ALERT_CHANNEL, json.dumps({
            "station_id": station_id,
            "station_name": station_name,
            "parameter": "turbidity",
            "value": value,
            "level": level.value,
            "message": msg,
            "timestamp": recorded_at.isoformat() if hasattr(recorded_at, "isoformat") else str(recorded_at),
        }))

    db.commit()
    logger.info(f"turbidity check complete: {alerts_created} new alerts")
    return alerts_created


def check_conductance_spikes(db: Session):
    """
    Detect sudden spikes in specific conductance by comparing
    the latest reading to a rolling 24hr mean.
    A spike > configured % above the mean triggers an alert.
    """
    stations = db.execute(
        text("SELECT DISTINCT station_id, station_name FROM readings WHERE parameter = 'specific_conductance'")
    ).fetchall()

    alerts_created = 0

    for station_id, station_name in stations:
        result = db.execute(
            text("""
                SELECT
                    (SELECT value FROM readings
                     WHERE station_id = :sid AND parameter = 'specific_conductance'
                     ORDER BY recorded_at DESC LIMIT 1) AS latest,
                    (SELECT AVG(value) FROM readings
                     WHERE station_id = :sid AND parameter = 'specific_conductance'
                     AND recorded_at > NOW() - INTERVAL '24 hours') AS avg_24h
            """),
            {"sid": station_id},
        ).fetchone()

        if not result or result.latest is None or result.avg_24h is None:
            continue

        latest, avg_24h = result.latest, result.avg_24h

        if avg_24h == 0:
            continue

        pct_change = ((latest - avg_24h) / avg_24h) * 100

        if abs(pct_change) >= settings.conductance_spike_pct:
            direction = "above" if pct_change > 0 else "below"
            level = AlertLevel.WARNING
            msg = (
                f"WARNING: conductance at {station_name} is {abs(pct_change):.1f}% "
                f"{direction} 24hr average ({latest:.0f} vs {avg_24h:.0f} µS/cm)"
            )

            alert = Alert(
                station_id=station_id,
                station_name=station_name,
                parameter="specific_conductance",
                value=latest,
                threshold=avg_24h * (1 + settings.conductance_spike_pct / 100),
                level=level,
                message=msg,
                created_at=datetime.now(timezone.utc),
            )
            db.add(alert)
            alerts_created += 1

            redis_client.publish(ALERT_CHANNEL, json.dumps({
                "station_id": station_id,
                "station_name": station_name,
                "parameter": "specific_conductance",
                "value": latest,
                "level": level.value,
                "message": msg,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }))

    db.commit()
    logger.info(f"conductance check complete: {alerts_created} new alerts")
    return alerts_created
