"""
Data ingestion service using the official USGS dataretrieval package.
Reference: https://github.com/DOI-USGS/dataretrieval-python

Pulls instantaneous values (15-min intervals) for Tampa Bay stations.
"""

import logging
from datetime import datetime, timezone

import dataretrieval.nwis as nwis
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.models.reading import Reading

logger = logging.getLogger(__name__)

# human-readable names for the USGS parameter codes
PARAM_NAMES = {
    "00095": "specific_conductance",
    "63680": "turbidity",
    "00010": "temperature",
    "00300": "dissolved_oxygen",
}


def fetch_readings(period: str = "P1D"):
    """
    Fetch instantaneous values from USGS for all configured stations.
    Uses the dataretrieval package which wraps the USGS Water Services API.

    Args:
        period: ISO 8601 duration string (e.g. P1D = last 1 day, P7D = 7 days)

    Returns:
        DataFrame with columns: site_no, datetime, parameter_cd, value
    """
    site_ids = ",".join(settings.usgs_stations)
    param_codes = ",".join(settings.usgs_parameters)

    logger.info(f"fetching USGS data | sites={site_ids} params={param_codes} period={period}")

    df, metadata = nwis.get_iv(
        sites=site_ids,
        parameterCd=param_codes,
        period=period,
    )

    if df.empty:
        logger.warning("no data returned from USGS")
        return df

    logger.info(f"fetched {len(df)} records from USGS")
    return df


def store_readings(db: Session, df, station_names: dict = None):
    """
    Parse the dataretrieval DataFrame and store readings in TimescaleDB.
    Skips duplicates based on station + parameter + timestamp.
    """
    if df.empty:
        return 0

    now = datetime.now(timezone.utc)
    inserted = 0

    # dataretrieval returns multi-index with (site_no, datetime)
    # columns are like '00095' or '00095_cd' (qualifier columns)
    df = df.reset_index()

    for _, row in df.iterrows():
        site_no = str(row.get("site_no", ""))
        recorded_at = row.get("datetime")

        if not site_no or recorded_at is None:
            continue

        for param_code, param_name in PARAM_NAMES.items():
            # try direct column first, then depth-specific variants (top/middle/bottom)
            value = row.get(param_code)
            if value is None or value != value:
                for suffix in ("_top", "_middle", "_bottom"):
                    alt = row.get(f"{param_code}{suffix}")
                    if alt is not None and alt == alt:
                        value = alt
                        break

            if value is None or value != value:  # still NaN
                continue

            # skip USGS missing value sentinel
            if value == -999999:
                continue

            # check for duplicate before inserting
            exists = db.execute(
                text("""
                    SELECT 1 FROM readings
                    WHERE station_id = :sid AND parameter = :param AND recorded_at = :ts
                    LIMIT 1
                """),
                {"sid": site_no, "param": param_name, "ts": recorded_at},
            ).fetchone()

            if exists:
                continue

            reading = Reading(
                station_id=site_no,
                station_name=station_names.get(site_no, site_no) if station_names else site_no,
                parameter=param_name,
                value=float(value),
                recorded_at=recorded_at,
                ingested_at=now,
            )
            db.add(reading)
            inserted += 1

    db.commit()
    logger.info(f"inserted {inserted} new readings")
    return inserted


# default station name lookup
STATION_NAMES = {
    "023000095": "Manatee River at Rye",
    "02301721":  "Alafia River at Gibsonton",
    "02301718":  "Alafia River at Riverview",
    "02306028":  "Hillsborough River at Tampa",
    "02301500":  "Alafia River at Lithia",
}


def run_ingestion(db: Session, period: str = "P1D"):
    """Full ingestion pipeline: fetch from USGS → store in TimescaleDB."""
    df = fetch_readings(period=period)
    count = store_readings(db, df, station_names=STATION_NAMES)
    return count
