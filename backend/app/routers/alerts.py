"""
REST + WebSocket endpoints for alerts.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

import redis.asyncio as aioredis

from app.config import settings
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

ALERT_CHANNEL = "bayalert:alerts"


@router.get("/")
def get_alerts(
    limit: int = Query(default=50, le=200),
    level: str = Query(default=None),
    db: Session = Depends(get_db),
):
    """Get recent alerts, optionally filtered by level."""
    query = "SELECT * FROM alerts ORDER BY created_at DESC LIMIT :limit"
    params = {"limit": limit}

    if level:
        query = "SELECT * FROM alerts WHERE level = :level ORDER BY created_at DESC LIMIT :limit"
        params["level"] = level

    rows = db.execute(text(query), params).fetchall()

    return [
        {
            "id": r.id,
            "station_id": r.station_id,
            "station_name": r.station_name,
            "parameter": r.parameter,
            "value": r.value,
            "threshold": r.threshold,
            "level": r.level,
            "message": r.message,
            "created_at": r.created_at.isoformat(),
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
