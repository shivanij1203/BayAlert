"""
REST + WebSocket endpoints for alerts, including the operator workflow
(acknowledge, resolve, feedback) and delivery audit log.
"""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text

import redis.asyncio as aioredis

from app.config import settings
from app.database import get_db
from app.models.alert import Alert, AlertFeedback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

ALERT_CHANNEL = "bayalert:alerts"


def _serialize(alert: Alert) -> dict:
    return {
        "id": alert.id,
        "station_id": alert.station_id,
        "station_name": alert.station_name,
        "parameter": alert.parameter,
        "value": alert.value,
        "threshold": alert.threshold,
        "level": alert.level.value if hasattr(alert.level, "value") else str(alert.level),
        "message": alert.message,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
        "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
        "acknowledged_by": alert.acknowledged_by,
        "resolved_at": alert.resolved_at.isoformat() if alert.resolved_at else None,
        "feedback": alert.feedback,
        "notes": alert.notes,
        "last_delivered_at": alert.last_delivered_at.isoformat() if alert.last_delivered_at else None,
        "escalated_at": alert.escalated_at.isoformat() if alert.escalated_at else None,
    }


@router.get("/")
def get_alerts(
    limit: int = Query(default=50, le=200),
    level: str | None = Query(default=None),
    unresolved_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """Get recent alerts, optionally filtered by level / resolution state."""
    clauses: list[str] = []
    params: dict[str, object] = {"limit": limit}

    if level:
        clauses.append("level = :level")
        params["level"] = level
    if unresolved_only:
        clauses.append("resolved_at IS NULL")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"SELECT id FROM alerts {where} ORDER BY created_at DESC LIMIT :limit"
    ids = [row.id for row in db.execute(text(query), params).fetchall()]
    if not ids:
        return []

    alerts = db.execute(
        text("SELECT * FROM alerts WHERE id = ANY(:ids) ORDER BY created_at DESC"),
        {"ids": ids},
    ).fetchall()

    def level_value(r):
        return r.level.value if hasattr(r.level, "value") else str(r.level)

    return [
        {
            "id": r.id,
            "station_id": r.station_id,
            "station_name": r.station_name,
            "parameter": r.parameter,
            "value": r.value,
            "threshold": r.threshold,
            "level": level_value(r),
            "message": r.message,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
            "acknowledged_by": r.acknowledged_by,
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            "feedback": r.feedback,
            "notes": r.notes,
            "last_delivered_at": r.last_delivered_at.isoformat() if r.last_delivered_at else None,
            "escalated_at": r.escalated_at.isoformat() if r.escalated_at else None,
        }
        for r in alerts
    ]


class AckRequest(BaseModel):
    operator: str = Field(..., min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class ResolveRequest(BaseModel):
    operator: str = Field(..., min_length=1, max_length=120)
    feedback: AlertFeedback = AlertFeedback.CONFIRMED
    notes: str | None = Field(default=None, max_length=1000)


@router.post("/{alert_id}/ack")
def acknowledge_alert(
    alert_id: int,
    body: AckRequest,
    db: Session = Depends(get_db),
):
    """Operator acknowledges an alert, stopping the escalation timer."""
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert not found")

    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledged_by = body.operator
    if body.notes:
        alert.notes = body.notes
    db.commit()
    return _serialize(alert)


@router.post("/{alert_id}/resolve")
def resolve_alert(
    alert_id: int,
    body: ResolveRequest,
    db: Session = Depends(get_db),
):
    """Close out the alert and record whether it was a true positive."""
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert not found")

    now = datetime.now(timezone.utc)
    alert.resolved_at = now
    if not alert.acknowledged_at:
        alert.acknowledged_at = now
        alert.acknowledged_by = body.operator
    alert.feedback = body.feedback.value
    if body.notes:
        alert.notes = body.notes
    db.commit()
    return _serialize(alert)


@router.get("/{alert_id}/deliveries")
def list_deliveries(alert_id: int, db: Session = Depends(get_db)):
    """Audit trail of notification attempts for a given alert."""
    rows = db.execute(
        text(
            """
            SELECT channel, target, status, http_status, error, sent_at
            FROM alert_deliveries
            WHERE alert_id = :aid
            ORDER BY sent_at DESC
            """
        ),
        {"aid": alert_id},
    ).fetchall()
    return [
        {
            "channel": r.channel,
            "target": r.target,
            "status": r.status,
            "http_status": r.http_status,
            "error": r.error,
            "sent_at": r.sent_at.isoformat(),
        }
        for r in rows
    ]


@router.websocket("/ws")
async def alert_websocket(websocket: WebSocket):
    """
    WebSocket endpoint that streams alerts in real-time via Redis pub/sub.
    Clients connect here to get live alert notifications.
    """
    await websocket.accept()
    logger.info("websocket client connected for alerts")

    r = aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe(ALERT_CHANNEL)

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                await websocket.send_text(data)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        logger.info("websocket client disconnected")
    finally:
        await pubsub.unsubscribe(ALERT_CHANNEL)
        await r.close()
