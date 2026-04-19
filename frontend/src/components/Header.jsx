import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { DropletIcon, ClockIcon } from "./Icons";
import { getStations, getAlerts } from "../services/api";

export default function Header({ connected, lastSync }) {
  const [stationCount, setStationCount] = useState(null);
  const [criticalCount, setCriticalCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);

  useEffect(() => {
    Promise.all([getStations(), getAlerts(200)])
      .then(([stations, alerts]) => {
        setStationCount(stations.length);
        setCriticalCount(alerts.filter((a) => a.level?.toLowerCase() === "critical").length);
        setWarningCount(alerts.filter((a) => a.level?.toLowerCase() === "warning").length);
      })
      .catch(() => {});
  }, []);

  return (
    <motion.header
      className="app-header"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      role="banner"
    >
      <div className="header-left">
        <div className="logo-mark" aria-hidden="true">
          <DropletIcon size={18} color="white" />
        </div>
        <div className="logo-text">
          <h1>BayAlert</h1>
          <p>Tampa Bay Watershed Operations</p>
        </div>
      </div>

      <div className="header-stats">
        {stationCount !== null && (
          <>
            <div className="header-stat">
              <span className="header-stat-num">{stationCount}</span>
              <span className="header-stat-label">stations</span>
            </div>
            {criticalCount > 0 && (
              <div className="header-stat critical">
                <span className="header-stat-num">{criticalCount}</span>
                <span className="header-stat-label">critical</span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="header-stat warning">
                <span className="header-stat-num">{warningCount}</span>
                <span className="header-stat-label">warnings</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="header-right">
        {lastSync && (
          <span className="sync-text" aria-label={`Last sync at ${lastSync}`}>
            <ClockIcon size={11} /> {lastSync}
          </span>
        )}
        <div
          className={`live-pill ${connected ? "live" : "offline"}`}
          role="status"
          aria-live="polite"
        >
          <span className="live-dot" aria-hidden="true" />
          {connected ? "Live" : "Offline"}
        </div>
      </div>
    </motion.header>
  );
}
