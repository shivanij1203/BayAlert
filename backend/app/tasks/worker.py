"""
Celery worker configuration and scheduled tasks.
Reference: https://github.com/testdrivenio/fastapi-celery

Tasks:
- ingest_usgs: pulls latest USGS data every 15 minutes
- check_alerts: runs anomaly checks after each ingestion
- check_cascade: runs cross-station propagation checks
"""

import logging
from celery import Celery
from celery.schedules import crontab

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "bayalert",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="US/Eastern",
    enable_utc=True,
)

# scheduled tasks — runs ingestion every 15 minutes
celery_app.conf.beat_schedule = {
    "ingest-usgs-every-15-min": {
        "task": "app.tasks.worker.ingest_usgs",
        "schedule": crontab(minute="*/15"),
    },
    "check-alerts-every-15-min": {
        "task": "app.tasks.worker.check_alerts",
        "schedule": crontab(minute="*/15"),
        "args": [],
        "options": {"countdown": 60},  # run 1 min after ingestion
    },
    "check-cascade-every-15-min": {
        "task": "app.tasks.worker.check_cascade",
        "schedule": crontab(minute="*/15"),
        "args": [],
        "options": {"countdown": 90},  # run after alert checks
    },
    "ingest-env-every-30-min": {
        "task": "app.tasks.worker.ingest_env",
        "schedule": crontab(minute="*/30"),
    },
}


@celery_app.task(name="app.tasks.worker.ingest_usgs")
def ingest_usgs():
    """Pull latest readings from USGS and store in TimescaleDB."""
    from app.database import SessionLocal
    from app.services.ingest import run_ingestion

    db = SessionLocal()
    try:
        count = run_ingestion(db, period="P1D")
        logger.info(f"ingestion task complete: {count} new records")
        return {"status": "ok", "records_inserted": count}
    except Exception as e:
        logger.error(f"ingestion failed: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


@celery_app.task(name="app.tasks.worker.check_alerts")
def check_alerts():
    """Run threshold checks on recent readings."""
    from app.database import SessionLocal
    from app.services.alerts import check_turbidity, check_conductance_spikes

    db = SessionLocal()
    try:
        turbidity_alerts = check_turbidity(db)
        conductance_alerts = check_conductance_spikes(db)
        total = turbidity_alerts + conductance_alerts
        logger.info(f"alert check complete: {total} new alerts")
        return {"status": "ok", "alerts_created": total}
    except Exception as e:
        logger.error(f"alert check failed: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


@celery_app.task(name="app.tasks.worker.ingest_env")
def ingest_env():
    """Pull NOAA CO-OPS tide + NWS hourly forecast data."""
    from app.database import SessionLocal
    from app.services.env_ingest import run_env_ingestion

    db = SessionLocal()
    try:
        result = run_env_ingestion(db)
        logger.info("env ingestion task complete: %s", result)
        return {"status": "ok", **result}
    except Exception as exc:  # noqa: BLE001
        logger.error("env ingestion failed: %s", exc)
        return {"status": "error", "message": str(exc)}
    finally:
        db.close()


@celery_app.task(name="app.tasks.worker.check_cascade")
def check_cascade():
    """Run cross-station propagation checks for upstream events."""
    from app.database import SessionLocal
    from app.services.cascade import check_cascade_alerts

    db = SessionLocal()
    try:
        cascade_alerts = check_cascade_alerts(db)
        logger.info(f"cascade check complete: {cascade_alerts} new cascade alerts")
        return {"status": "ok", "cascade_alerts": cascade_alerts}
    except Exception as e:
        logger.error(f"cascade check failed: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
