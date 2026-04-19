import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { getAlerts } from "../services/api";
import { useAlertWebSocket } from "../hooks/useAlertWebSocket";
import { AlertOctagonIcon, AlertTriangleIcon, CheckCircleIcon } from "./Icons";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";

export default function AlertBanner() {
  const [historicAlerts, setHistoricAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { alerts: liveAlerts, connected } = useAlertWebSocket();

  useEffect(() => {
    getAlerts(20)
      .then((a) => {
        setHistoricAlerts(a);
        setLoading(false);
      })
      .catch(() => {
        setHistoricAlerts([]);
        setLoading(false);
      });
  }, []);

  const allAlerts = [...liveAlerts, ...historicAlerts].slice(0, 30);

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
            {allAlerts.map((alert, i) => {
              const level = (alert.level || "").toLowerCase();
              const isCritical = level === "critical";
              const Icon = isCritical ? AlertOctagonIcon : AlertTriangleIcon;
              const color = isCritical ? "var(--color-critical)" : "var(--color-warning)";

              return (
                <motion.li
                  key={alert.id || `live-${i}-${alert.timestamp}`}
                  className={`alert-item ${level}`}
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
                    <div className="alert-time">
                      {new Date(alert.created_at || alert.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}
