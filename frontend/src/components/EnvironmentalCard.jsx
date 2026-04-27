import { useEffect, useState } from "react";
import { motion } from "motion/react";

import { getEnvironmentalLatest, getRainForecast } from "../services/api";

/**
 * Shows NOAA weather + tide context: current water level / temp, and the
 * upstream 24h rain outlook. Interprets the outlook as turbidity risk.
 */
export default function EnvironmentalCard() {
  const [latest, setLatest] = useState([]);
  const [rain, setRain] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [envs, rainOutlook] = await Promise.all([
          getEnvironmentalLatest(),
          getRainForecast(),
        ]);
        if (!mounted) return;
        setLatest(envs);
        setRain(rainOutlook);
      } catch {
        /* offline — fall through to empty state */
      } finally {
        if (mounted) setLoaded(true);
      }
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const tideLevel = latest.find((r) => r.parameter === "water_level");
  const tideTemp = latest.find((r) => r.parameter === "water_temperature");
  const worstRain = rain.length > 0 ? rain[0] : null;
  const risk = interpretRisk(worstRain);

  return (
    <motion.div
      className="card env-card"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4 }}
    >
      <div className="card-header">
        <h3>Environmental context</h3>
        <span className="card-subtitle">NOAA · updated every 30 min</span>
      </div>

      {!loaded ? (
        <p className="muted-empty">Loading NOAA feeds…</p>
      ) : latest.length === 0 && rain.length === 0 ? (
        <p className="muted-empty">NOAA pipeline offline</p>
      ) : (
        <div className="env-grid">
          <EnvStat
            label="Tide (MLLW)"
            value={tideLevel ? `${tideLevel.value.toFixed(2)} m` : "—"}
            sub={tideLevel?.station_name}
          />
          <EnvStat
            label="Bay water"
            value={tideTemp ? `${tideTemp.value.toFixed(1)} °C` : "—"}
            sub={tideTemp?.station_name}
          />
          <EnvStat
            label="Max rain prob (24h)"
            value={worstRain ? `${Math.round(worstRain.max_precip_prob ?? 0)}%` : "—"}
            sub={worstRain?.station_name}
          />
          <EnvStat
            label="Total precip (24h)"
            value={worstRain ? `${(worstRain.total_precip_mm ?? 0).toFixed(1)} mm` : "—"}
            sub="sum across hourly forecast"
          />
        </div>
      )}

      {risk && (
        <div className={`env-risk env-risk-${risk.level}`} role="status">
          <span className="env-risk-dot" aria-hidden="true" />
          <span className="env-risk-text">{risk.message}</span>
        </div>
      )}
    </motion.div>
  );
}

function EnvStat({ label, value, sub }) {
  return (
    <div className="env-stat">
      <div className="env-stat-label">{label}</div>
      <div className="env-stat-value">{value}</div>
      {sub && <div className="env-stat-sub">{sub}</div>}
    </div>
  );
}

function interpretRisk(outlook) {
  if (!outlook) return null;
  const prob = outlook.max_precip_prob ?? 0;
  const total = outlook.total_precip_mm ?? 0;
  const where = outlook.station_name ? ` over ${outlook.station_name}` : "";

  if (prob >= 70 || total >= 15) {
    return {
      level: "high",
      message: `Heavy rain likely${where}. Expect runoff-driven turbidity spikes in 2–6 hours.`,
    };
  }
  if (prob >= 40 || total >= 5) {
    return {
      level: "moderate",
      message: `Moderate rain chance${where}. Watch upstream turbidity; cascade thresholds lowered.`,
    };
  }
  return {
    level: "low",
    message: `Low precipitation risk${where}. Baseline monitoring.`,
  };
}
