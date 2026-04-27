import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

import { getAlerts, acknowledgeAlert, resolveAlert } from "../services/api";
import { useAlertWebSocket } from "../hooks/useAlertWebSocket";
import { AlertOctagonIcon, AlertTriangleIcon, CheckCircleIcon } from "./Icons";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";

const DEFAULT_OPERATOR = "operator";

export default function AlertBanner() {
  const [serverAlerts, setServerAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const { alerts: liveAlerts, connected } = useAlertWebSocket();

  const reload = useCallback(() => {
    return getAlerts(20)
      .then((a) => setServerAlerts(a))
      .catch(() => setServerAlerts([]));
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  // live alerts that don't yet have a DB id get shown at the top; once the
  // server reload completes, they merge into serverAlerts and the duplicate
  // (same station+timestamp) is filtered out.
  const pendingLive = liveAlerts.filter(
    (la) =>
      !serverAlerts.some(
        (sa) =>
          sa.station_id === la.station_id &&
          sa.parameter === la.parameter &&
          Math.abs(new Date(sa.created_at) - new Date(la.timestamp || la.created_at)) < 60_000,
      ),
  );
  const allAlerts = [...pendingLive, ...serverAlerts].slice(0, 30);

  async function onAck(alert) {
    if (!alert.id) return;
    setBusyId(alert.id);
    try {
      const updated = await acknowledgeAlert(alert.id, DEFAULT_OPERATOR);
      setServerAlerts((prev) => prev.map((a) => (a.id === alert.id ? updated : a)));
    } catch (err) {
      // non-fatal; leave state as-is
    } finally {
      setBusyId(null);
    }
  }

  async function onResolve(alert, feedback) {
    if (!alert.id) return;
    setBusyId(alert.id);
    try {
      const updated = await resolveAlert(alert.id, { operator: DEFAULT_OPERATOR, feedback });
      setServerAlerts((prev) => prev.map((a) => (a.id === alert.id ? updated : a)));
    } catch {
      /* noop */
    } finally {
      setBusyId(null);
    }
  }

  return (
    <motion.div
      className="card alert-banner"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
    >
      <div className="card-header">
        <h3>Alerts</h3>
        <span className={`live-pill compact ${connected ? "live" : "offline"}`}>
          <span className="live-dot" />
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: 12, background: "var(--color-surface-2)", borderRadius: 8 }}>
              <Skeleton width={14} height={14} radius={3} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton width="90%" height={11} />
                <Skeleton width={50} height={9} />
              </div>
            </div>
          ))}
        </div>
      ) : allAlerts.length === 0 ? (
        <EmptyState
          compact
          title="All clear"
          hint="No alerts in the last 24 hours."
          icon={<CheckCircleIcon size={28} color="var(--color-success)" />}
        />
      ) : (
        <ul className="alert-list">
          <AnimatePresence initial={false}>
            {allAlerts.map((alert, i) => (
              <AlertRow
                key={alert.id || `live-${i}-${alert.timestamp}`}
                alert={alert}
                busy={busyId === alert.id}
                onAck={onAck}
                onResolve={onResolve}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}

function AlertRow({ alert, busy, onAck, onResolve }) {
  const level = (alert.level || "").toLowerCase();
  const isCritical = level === "critical";
  const Icon = isCritical ? AlertOctagonIcon : AlertTriangleIcon;
  const color = isCritical ? "var(--color-critical)" : "var(--color-warning)";

  const acknowledged = Boolean(alert.acknowledged_at);
  const resolved = Boolean(alert.resolved_at);
  const escalated = Boolean(alert.escalated_at);

  return (
    <motion.li
      className={`alert-item ${level} ${resolved ? "resolved" : ""}`}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <span className="alert-icon" style={{ color }}>
        <Icon size={16} color={color} />
      </span>
      <div className="alert-body">
        <div className="alert-message">{alert.message}</div>
        <div className="alert-meta">
          <span className="alert-time">
            {new Date(alert.created_at || alert.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {escalated && !resolved && (
            <span className="alert-tag alert-tag-escalated">escalated</span>
          )}
          {acknowledged && !resolved && (
            <span className="alert-tag alert-tag-ack">ack · {alert.acknowledged_by || "operator"}</span>
          )}
          {resolved && (
            <span className="alert-tag alert-tag-resolved">
              resolved{alert.feedback && alert.feedback !== "unknown" ? ` · ${alert.feedback.replace("_", " ")}` : ""}
            </span>
          )}
        </div>

        {alert.id && !resolved && (
          <div className="alert-actions">
            {!acknowledged && (
              <button
                type="button"
                className="alert-btn"
                onClick={() => onAck(alert)}
                disabled={busy}
              >
                Acknowledge
              </button>
            )}
            <button
              type="button"
              className="alert-btn alert-btn-primary"
              onClick={() => onResolve(alert, "confirmed")}
              disabled={busy}
            >
              Resolve
            </button>
            <button
              type="button"
              className="alert-btn alert-btn-ghost"
              onClick={() => onResolve(alert, "false_positive")}
              disabled={busy}
              title="Mark this alert as a false positive (feeds back into model tuning)"
            >
              False positive
            </button>
          </div>
        )}
      </div>
    </motion.li>
  );
}
