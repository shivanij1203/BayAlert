import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { getStations, getAlerts } from "../services/api";

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function LiveProofBar() {
  const [stats, setStats] = useState({
    readings: 0,
    alertsToday: 0,
    lastSync: null,
    isLive: false,
  });

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [stations, alerts] = await Promise.all([getStations(), getAlerts(200)]);
        if (!mounted) return;

        const totalReadings = stations.reduce((sum, s) => sum + (s.reading_count || 0), 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const alertsToday = alerts.filter(
          (a) => new Date(a.created_at) >= today,
        ).length;

        const latestReading = stations.reduce((latest, s) => {
          const t = new Date(s.last_reading);
          return !latest || t > latest ? t : latest;
        }, null);

        setStats({
          readings: totalReadings,
          alertsToday,
          lastSync: latestReading,
          isLive: stations.length > 0,
        });
      } catch {
        if (mounted) setStats((s) => ({ ...s, isLive: false }));
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <motion.section
      className="proof-bar"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="proof-inner">
        <div className="proof-item">
          <span className="proof-num">
            {stats.readings.toLocaleString()}
          </span>
          <span className="proof-label">readings ingested</span>
        </div>
        <div className="proof-divider" />
        <div className="proof-item">
          <span className="proof-num">{stats.alertsToday}</span>
          <span className="proof-label">anomalies today</span>
        </div>
        <div className="proof-divider" />
        <div className="proof-item">
          <span className="proof-num">
            {stats.lastSync ? timeAgo(stats.lastSync) : "—"}
          </span>
          <span className="proof-label">last sync</span>
        </div>
        <div className="proof-divider" />
        <div className="proof-item">
          <span className={`proof-status ${stats.isLive ? "live" : "offline"}`}>
            <span className="live-dot" />
            {stats.isLive ? "Pipeline running" : "Pipeline offline"}
          </span>
        </div>
      </div>
    </motion.section>
  );
}
