import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { MapPinIcon, AlertTriangleIcon, AlertOctagonIcon, CheckCircleIcon } from "./Icons";
import { getStations, getAlerts } from "../services/api";
import Skeleton from "./Skeleton";

function CountUp({ end, duration = 800 }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let frame;
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(end * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setValue(end);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [end, duration]);

  return <>{value}</>;
}

function KPICard({ label, value, icon, accent, delay = 0, loading }) {
  return (
    <motion.div
      className="kpi-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -2 }}
    >
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">
          {loading ? (
            <Skeleton width={48} height={28} />
          ) : typeof value === "number" ? (
            <CountUp end={value} />
          ) : (
            value
          )}
        </div>
      </div>
      <div className={`kpi-icon ${accent}`} aria-hidden="true">{icon}</div>
    </motion.div>
  );
}

export default function KPICards() {
  const [stationCount, setStationCount] = useState(0);
  const [alertCounts, setAlertCounts] = useState({ total: 0, critical: 0, warning: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStations(), getAlerts(200)])
      .then(([stations, alerts]) => {
        setStationCount(stations.length);
        const critical = alerts.filter((a) => a.level?.toLowerCase() === "critical").length;
        const warning = alerts.filter((a) => a.level?.toLowerCase() === "warning").length;
        setAlertCounts({ total: alerts.length, critical, warning });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const systemHealth = alertCounts.critical === 0 ? "OK" : "Alert";

  return (
    <div className="kpi-grid">
      <KPICard
        label="Active Stations"
        value={stationCount}
        icon={<MapPinIcon size={16} />}
        accent="kpi-blue"
        delay={0}
        loading={loading}
      />
      <KPICard
        label="Total Alerts (24h)"
        value={alertCounts.total}
        icon={<AlertTriangleIcon size={16} />}
        accent="kpi-amber"
        delay={0.06}
        loading={loading}
      />
      <KPICard
        label="Critical Alerts"
        value={alertCounts.critical}
        icon={<AlertOctagonIcon size={16} />}
        accent={alertCounts.critical > 0 ? "kpi-red" : "kpi-slate"}
        delay={0.12}
        loading={loading}
      />
      <KPICard
        label="System Status"
        value={systemHealth}
        icon={<CheckCircleIcon size={16} />}
        accent={systemHealth === "OK" ? "kpi-green" : "kpi-red"}
        delay={0.18}
        loading={loading}
      />
    </div>
  );
}
