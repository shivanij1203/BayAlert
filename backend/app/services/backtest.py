"""
Backtesting: replay historical USGS data to quantify the lead time BayAlert
would have given operators if it had been running.

For each cascade edge (upstream → downstream):
  1. Find every upstream "spike event" — a reading above that station's
     own historical percentile threshold in the window (or, for turbidity,
     above a fixed FNU threshold).
  2. Look for a downstream spike that follows within ~2× the estimated
     travel time.
  3. Record the lead time (downstream_time − upstream_time).

Since only Lithia has a turbidity sensor, the default parameter is
`specific_conductance`, which every station reports. Percentile thresholds
adapt to each station's natural baseline (Lithia is freshwater ~600 µS/cm,
Gibsonton is brackish ~45k µS/cm).
"""

from __future__ import annotations

import logging
import statistics
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.services.cascade import EDGES, STATIONS

logger = logging.getLogger(__name__)

# fixed-threshold parameters (absolute FNU / mg/L)
FIXED_THRESHOLDS = {
    "turbidity": 15.0,
}

# percentile-threshold parameters (value ≥ station's Nth percentile)
PERCENTILE_PARAMS = {
    "specific_conductance": 95,
}


@dataclass(frozen=True)
class CascadeEvent:
    upstream_station_id: str
    upstream_station_name: str
    upstream_value: float
    upstream_time: datetime
    downstream_station_id: str
    downstream_station_name: str
    downstream_value: float
    downstream_time: datetime
    lead_minutes: float

    def to_dict(self) -> dict:
        d = asdict(self)
        d["upstream_time"] = self.upstream_time.isoformat()
        d["downstream_time"] = self.downstream_time.isoformat()
        return d


def _station_threshold(
    db: Session,
    station_id: str,
    parameter: str,
    since: datetime,
) -> float | None:
    """Return the threshold value for a station+parameter in the window."""
    if parameter in FIXED_THRESHOLDS:
        return FIXED_THRESHOLDS[parameter]

    if parameter in PERCENTILE_PARAMS:
        percentile = PERCENTILE_PARAMS[parameter] / 100.0
        row = db.execute(
            text(
                """
                SELECT percentile_cont(:p) WITHIN GROUP (ORDER BY value) AS threshold
                FROM readings
                WHERE station_id = :sid
                  AND parameter = :param
                  AND recorded_at >= :since
                """
            ),
            {"sid": station_id, "param": parameter, "since": since, "p": percentile},
        ).fetchone()
        if row and row.threshold is not None:
            return float(row.threshold)

    return None


def _fetch_exceedances(
    db: Session,
    station_id: str,
    parameter: str,
    threshold: float,
    since: datetime,
) -> list[tuple[datetime, float]]:
    rows = db.execute(
        text(
            """
            SELECT recorded_at, value
            FROM readings
            WHERE station_id = :sid
              AND parameter = :param
              AND value >= :threshold
              AND recorded_at >= :since
            ORDER BY recorded_at ASC
            """
        ),
        {"sid": station_id, "param": parameter, "threshold": threshold, "since": since},
    ).fetchall()
    return [(r.recorded_at, float(r.value)) for r in rows]


def _collapse_events(
    events: list[tuple[datetime, float]],
    gap_minutes: int = 60,
) -> list[tuple[datetime, float]]:
    """Group consecutive exceedances into single 'events' (first sample per event)."""
    if not events:
        return []
    collapsed = [events[0]]
    for ts, val in events[1:]:
        last_ts, _ = collapsed[-1]
        if (ts - last_ts).total_seconds() / 60 > gap_minutes:
            collapsed.append((ts, val))
    return collapsed


def run_backtest(
    db: Session,
    hours: int = 720,
    parameter: str = "specific_conductance",
) -> dict:
    """
    Replay the last `hours` of data and return a summary of cascade lead time.
    Default 720h = 30 days, default parameter = specific_conductance.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    all_events: list[CascadeEvent] = []
    thresholds: dict[str, float] = {}

    for edge in EDGES:
        upstream = STATIONS[edge.upstream]
        downstream = STATIONS[edge.downstream]

        up_threshold = _station_threshold(db, upstream.station_id, parameter, since)
        down_threshold = _station_threshold(db, downstream.station_id, parameter, since)
        if up_threshold is None or down_threshold is None:
            continue
        thresholds[upstream.name] = round(up_threshold, 1)
        thresholds[downstream.name] = round(down_threshold, 1)

        up_hits = _collapse_events(
            _fetch_exceedances(db, upstream.station_id, parameter, up_threshold, since)
        )
        if not up_hits:
            continue

        down_hits = _fetch_exceedances(
            db, downstream.station_id, parameter, down_threshold, since
        )
        if not down_hits:
            continue

        window = timedelta(minutes=edge.travel_minutes * 2)

        for up_time, up_value in up_hits:
            match = next(
                ((ts, val) for ts, val in down_hits if up_time <= ts <= up_time + window),
                None,
            )
            if match is None:
                continue
            down_time, down_value = match
            lead = (down_time - up_time).total_seconds() / 60
            if lead <= 0:
                continue

            all_events.append(CascadeEvent(
                upstream_station_id=upstream.station_id,
                upstream_station_name=upstream.name,
                upstream_value=up_value,
                upstream_time=up_time,
                downstream_station_id=downstream.station_id,
                downstream_station_name=downstream.name,
                downstream_value=down_value,
                downstream_time=down_time,
                lead_minutes=round(lead, 1),
            ))

    lead_times = [e.lead_minutes for e in all_events]
    summary = {
        "window_hours": hours,
        "parameter": parameter,
        "thresholds": thresholds,
        "event_count": len(all_events),
        "mean_lead_minutes": round(statistics.mean(lead_times), 1) if lead_times else 0.0,
        "median_lead_minutes": round(statistics.median(lead_times), 1) if lead_times else 0.0,
        "max_lead_minutes": round(max(lead_times), 1) if lead_times else 0.0,
        "total_lead_hours": round(sum(lead_times) / 60, 1) if lead_times else 0.0,
    }
    logger.info("backtest %sh parameter=%s: %s", hours, parameter, summary)
    return {
        "summary": summary,
        "events": [e.to_dict() for e in all_events[:50]],
    }
