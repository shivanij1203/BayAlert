"""
Outbound notification channels: webhook + SMTP email.

Every delivery attempt (success or failure) is persisted in the
alert_deliveries audit table, so operators can confirm an alert
actually made it to the on-call channel.
"""

from __future__ import annotations

import logging
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.alert import Alert, AlertDelivery

logger = logging.getLogger(__name__)


def _log(
    db: Session,
    alert_id: int,
    channel: str,
    target: str,
    status: str,
    *,
    http_status: str | None = None,
    error: str | None = None,
) -> None:
    db.add(AlertDelivery(
        alert_id=alert_id,
        channel=channel,
        target=target,
        status=status,
        http_status=http_status,
        error=error,
        sent_at=datetime.now(timezone.utc),
    ))


def _alert_payload(alert: Alert, *, escalation: bool) -> dict[str, Any]:
    return {
        "id": alert.id,
        "level": alert.level.value if hasattr(alert.level, "value") else str(alert.level),
        "station_id": alert.station_id,
        "station_name": alert.station_name,
        "parameter": alert.parameter,
        "value": alert.value,
        "threshold": alert.threshold,
        "message": alert.message,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
        "escalation": escalation,
        "ack_url": f"/api/alerts/{alert.id}/ack",
    }


def send_webhook(db: Session, alert: Alert, *, escalation: bool = False) -> bool:
    """POST the alert to the configured webhook. Returns True on HTTP 2xx."""
    url = settings.webhook_url
    if not url:
        return False

    payload = _alert_payload(alert, escalation=escalation)
    try:
        with httpx.Client(timeout=settings.webhook_timeout_s) as client:
            response = client.post(url, json=payload)
        ok = 200 <= response.status_code < 300
        _log(
            db, alert.id, "webhook", url,
            "ok" if ok else "failed",
            http_status=str(response.status_code),
            error=None if ok else response.text[:400],
        )
        return ok
    except httpx.HTTPError as exc:
        logger.warning("webhook delivery failed for alert %s: %s", alert.id, exc)
        _log(db, alert.id, "webhook", url, "failed", error=str(exc)[:400])
        return False


def send_email(db: Session, alert: Alert, *, escalation: bool = False) -> bool:
    """Send the alert via SMTP. Returns True on success."""
    if not settings.smtp_host or not settings.smtp_to:
        return False

    prefix = "[ESCALATED] " if escalation else ""
    subject = f"{prefix}[{alert.level}] BayAlert · {alert.station_name} · {alert.parameter}"
    body = (
        f"{alert.message}\n\n"
        f"Station: {alert.station_name} ({alert.station_id})\n"
        f"Parameter: {alert.parameter}\n"
        f"Value: {alert.value} (threshold {alert.threshold})\n"
        f"Time: {alert.created_at.isoformat() if alert.created_at else 'unknown'}\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = ", ".join(settings.smtp_to)
    msg.set_content(body)

    target = ",".join(settings.smtp_to)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.ehlo()
            if settings.smtp_port == 587:
                smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        _log(db, alert.id, "email", target, "ok")
        return True
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("email delivery failed for alert %s: %s", alert.id, exc)
        _log(db, alert.id, "email", target, "failed", error=str(exc)[:400])
        return False


def deliver_alert(db: Session, alert: Alert, *, escalation: bool = False) -> dict[str, bool]:
    """Fan out the alert to all configured channels and persist the attempt."""
    now = datetime.now(timezone.utc)
    results = {
        "webhook": send_webhook(db, alert, escalation=escalation),
        "email": send_email(db, alert, escalation=escalation),
    }

    alert.last_delivered_at = now
    if escalation:
        alert.escalated_at = now

    db.commit()
    logger.info("delivered alert %s escalation=%s results=%s", alert.id, escalation, results)
    return results
