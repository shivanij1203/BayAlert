"""
Alert delivery + operator workflow service.

Two entry points:
- `deliver_pending(db)`   — fan out newly-created alerts that have never
                            been delivered to any channel.
- `escalate_stale(db)`    — re-send critical alerts that have stayed
                            un-acknowledged past the grace window, flagging
                            them as escalations.

Operator workflow (ack / resolve / feedback) lives in the HTTP router.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.alert import Alert, AlertLevel
from app.services.notifications import deliver_alert

logger = logging.getLogger(__name__)


def deliver_pending(db: Session) -> int:
    """Deliver every alert that doesn't yet have a delivery timestamp."""
    pending = db.execute(
        select(Alert).where(Alert.last_delivered_at.is_(None)).order_by(Alert.created_at.asc())
    ).scalars().all()

    delivered = 0
    for alert in pending:
        results = deliver_alert(db, alert, escalation=False)
        if any(results.values()):
            delivered += 1

    if pending:
        logger.info("delivery pass: %d pending, %d delivered", len(pending), delivered)
    return delivered


def escalate_stale(db: Session) -> int:
    """Re-send critical alerts that are past the grace window with no ack."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=settings.escalation_grace_minutes)

    stale = db.execute(
        select(Alert).where(
            Alert.level == AlertLevel.CRITICAL,
            Alert.acknowledged_at.is_(None),
            Alert.resolved_at.is_(None),
            Alert.escalated_at.is_(None),
            Alert.created_at <= cutoff,
        )
    ).scalars().all()

    escalated = 0
    for alert in stale:
        results = deliver_alert(db, alert, escalation=True)
        if any(results.values()):
            escalated += 1

    if stale:
        logger.info("escalation pass: %d stale, %d escalated", len(stale), escalated)
    return escalated
