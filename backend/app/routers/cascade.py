"""
REST endpoints for the cross-station cascade alert system.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.cascade import check_cascade_alerts, get_watershed_topology

router = APIRouter(prefix="/api/cascade", tags=["cascade"])


@router.get("/topology")
def watershed_topology():
    """
    Return the watershed graph showing station connections
    and estimated propagation times between them.
    """
    return get_watershed_topology()


@router.post("/check")
def trigger_cascade_check(db: Session = Depends(get_db)):
    """Manually trigger a cascade alert check."""
    count = check_cascade_alerts(db)
    return {"alerts_created": count}
