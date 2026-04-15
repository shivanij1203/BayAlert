"""
Cross-station cascade alert system.

Models the Tampa Bay watershed as a directed graph where upstream events
propagate downstream. When an anomaly is detected upstream, cascade alerts
are generated for downstream stations with estimated arrival times.

Watershed topology (Alafia River):
    Lithia (upstream) → Riverview (midstream) → Gibsonton (bay mouth)

Watershed topology (Hillsborough River):
    Tampa/Platt St (tidal influence zone)

This is the key differentiator — predicting events at downstream stations
before the water actually reaches them, based on upstream signals.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

import redis
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.models.alert import Alert, AlertLevel

logger = logging.getLogger(__name__)

redis_client = redis.from_url(settings.redis_url)
CASCADE_CHANNEL = "bayalert:cascade"


@dataclass(frozen=True)
class StationNode:
    station_id: str
    name: str
    river_km: float  # approximate distance from bay mouth


@dataclass(frozen=True)
class PropagationEdge:
    upstream: str       # station_id
    downstream: str     # station_id
    travel_minutes: int # estimated travel time between stations


# Tampa Bay watershed graph — based on USGS station locations
# river_km is approximate distance upstream from Tampa Bay
STATIONS = {
    "02301500": StationNode("02301500", "Alafia River at Lithia", 35.0),
    "02301718": StationNode("02301718", "Alafia River at Riverview", 15.0),
    "02301721": StationNode("02301721", "Alafia River at Gibsonton", 5.0),
    "02306028": StationNode("02306028", "Hillsborough River at Tampa", 3.0),
    "023000095": StationNode("023000095", "Manatee River at Rye", 25.0),
}

# propagation edges — estimated travel times based on river distance and flow
# these are rough estimates; real values depend on flow rate, tidal conditions
EDGES = [
    PropagationEdge("02301500", "02301718", travel_minutes=180),  # Lithia → Riverview (~20km, ~3hr)
    PropagationEdge("02301718", "02301721", travel_minutes=120),  # Riverview → Gibsonton (~10km, ~2hr)
]


def get_downstream_stations(station_id: str) -> list[tuple[str, int]]:
    """
    Find all downstream stations from a given station.
    Returns list of (station_id, cumulative_travel_minutes).
    """
    downstream = []
    current = station_id
    cumulative_time = 0

    while True:
        edge = next((e for e in EDGES if e.upstream == current), None)
        if edge is None:
            break
        cumulative_time += edge.travel_minutes
        downstream.append((edge.downstream, cumulative_time))
        current = edge.downstream

    return downstream


def check_cascade_alerts(db: Session):
    """
    Check for anomalies at upstream stations and generate cascade alerts
    for downstream stations with estimated arrival times.

    Logic:
    1. Look for recent anomalies at upstream stations (turbidity or conductance)
    2. For each anomaly, find downstream stations
    3. Generate cascade alerts with predicted arrival time
    4. Publish to Redis for real-time dashboard updates
    """
    # find upstream stations that have recent threshold breaches
    upstream_ids = [e.upstream for e in EDGES]
    if not upstream_ids:
        return 0

    placeholders = ", ".join([f":s{i}" for i in range(len(upstream_ids))])
    params = {f"s{i}": sid for i, sid in enumerate(upstream_ids)}
    params["since"] = datetime.now(timezone.utc) - timedelta(hours=1)

    # get recent high-value readings from upstream stations
    rows = db.execute(
        text(f"""
            SELECT station_id, station_name, parameter, value, recorded_at
            FROM readings
            WHERE station_id IN ({placeholders})
            AND recorded_at > :since
            AND (
                (parameter = 'turbidity' AND value > :turb_warn)
                OR (parameter = 'specific_conductance' AND value > :cond_high)
            )
            ORDER BY recorded_at DESC
        """),
        {**params, "turb_warn": settings.turbidity_warning, "cond_high": 45000},
    ).fetchall()

    alerts_created = 0

    for row in rows:
        station_id, station_name, parameter, value, recorded_at = row

        downstream = get_downstream_stations(station_id)
        if not downstream:
            continue

        for ds_station_id, travel_minutes in downstream:
            ds_node = STATIONS.get(ds_station_id)
            if ds_node is None:
                continue

            estimated_arrival = recorded_at + timedelta(minutes=travel_minutes)

            # skip if arrival time is already past
            if estimated_arrival < datetime.now(timezone.utc):
                continue

            # check we haven't already created this cascade alert
            existing = db.execute(
                text("""
                    SELECT 1 FROM alerts
                    WHERE station_id = :ds_sid
                    AND parameter = :param
                    AND message LIKE :pattern
                    AND created_at > :since
                    LIMIT 1
                """),
                {
                    "ds_sid": ds_station_id,
                    "param": parameter,
                    "pattern": f"%cascade from {station_name}%",
                    "since": datetime.now(timezone.utc) - timedelta(hours=2),
                },
            ).fetchone()

            if existing:
                continue

            hours = travel_minutes // 60
            mins = travel_minutes % 60
            eta_str = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"

            msg = (
                f"CASCADE ALERT: {parameter} event detected upstream at {station_name} "
                f"({value:.1f}), estimated arrival at {ds_node.name} in ~{eta_str} "
                f"(cascade from {station_name})"
            )

            alert = Alert(
                station_id=ds_station_id,
                station_name=ds_node.name,
                parameter=parameter,
                value=value,
                threshold=settings.turbidity_warning if parameter == "turbidity" else 45000,
                level=AlertLevel.WARNING,
                message=msg,
                created_at=datetime.now(timezone.utc),
            )
            db.add(alert)
            alerts_created += 1

            # publish cascade alert to Redis
            redis_client.publish(CASCADE_CHANNEL, json.dumps({
                "type": "cascade",
                "source_station": station_name,
                "target_station": ds_node.name,
                "parameter": parameter,
                "upstream_value": value,
                "travel_minutes": travel_minutes,
                "estimated_arrival": estimated_arrival.isoformat(),
                "level": "warning",
                "message": msg,
            }))

            logger.info(
                f"cascade alert: {station_name} → {ds_node.name} | "
                f"{parameter}={value:.1f} | ETA: {eta_str}"
            )

    db.commit()
    logger.info(f"cascade check complete: {alerts_created} new cascade alerts")
    return alerts_created


def get_watershed_topology():
    """Return the watershed graph for visualization on the dashboard."""
    return {
        "stations": [
            {
                "station_id": s.station_id,
                "name": s.name,
                "river_km": s.river_km,
            }
            for s in STATIONS.values()
        ],
        "edges": [
            {
                "upstream": e.upstream,
                "upstream_name": STATIONS[e.upstream].name,
                "downstream": e.downstream,
                "downstream_name": STATIONS[e.downstream].name,
                "travel_minutes": e.travel_minutes,
            }
            for e in EDGES
        ],
    }
