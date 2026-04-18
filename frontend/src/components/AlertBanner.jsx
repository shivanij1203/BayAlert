import { useState, useEffect } from "react";
import { getAlerts } from "../services/api";
import { useAlertWebSocket } from "../hooks/useAlertWebSocket";

export default function AlertBanner() {
  const [historicAlerts, setHistoricAlerts] = useState([]);
  const { alerts: liveAlerts, connected } = useAlertWebSocket();

  useEffect(() => {
    getAlerts(20)
      .then(setHistoricAlerts)
      .catch(() => setHistoricAlerts([]));
  }, []);

  // merge live alerts on top of historic
  const allAlerts = [...liveAlerts, ...historicAlerts].slice(0, 30);

  return (
    <div className="alert-banner">
      <div className="alert-header">
        <h3>Alerts</h3>
        <span className={`ws-status ${connected ? "connected" : "disconnected"}`}>
          {connected ? "● Live" : "○ Disconnected"}
        </span>
      </div>

      {allAlerts.length === 0 ? (
        <p className="no-alerts">No alerts</p>
      ) : (
        <ul className="alert-list">
          {allAlerts.map((alert, i) => (
            <li key={alert.id || `live-${i}`} className={`alert-item ${alert.level}`}>
              <span className="alert-level">
                {alert.level === "critical" ? "🔴" : "🟡"}
              </span>
              <span className="alert-message">{alert.message}</span>
              <span className="alert-time">
                {new Date(alert.created_at || alert.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
