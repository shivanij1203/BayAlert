"""
Backtesting API — proves out the cascade lead time on historical data.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.backtest import run_backtest

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


@router.get("/cascade-lead-time")
def cascade_lead_time(
    hours: int = Query(default=720, ge=24, le=8760, description="window in hours (default 30d)"),
    parameter: str = Query(
        default="specific_conductance",
        description="parameter to backtest (default conductance — measured at every station)",
    ),
    db: Session = Depends(get_db),
):
    """
    Replay the last N hours and return how much lead time BayAlert's
    cascade would have given operators on each upstream→downstream event.
    """
    return run_backtest(db, hours=hours, parameter=parameter)
