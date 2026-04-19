import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { getLatestReadings, getAlerts, getStationHistory } from "../services/api";
import FlowingWaves from "./FlowingWaves";
import Sparkline from "./Sparkline";
import Skeleton from "./Skeleton";

const PARAM_LABELS = {
  specific_conductance: "Conductance",
  turbidity: "Turbidity",
  temperature: "Temperature",
  dissolved_oxygen: "Dissolved O₂",
};

const PARAM_UNITS = {
  specific_conductance: "µS/cm",
  turbidity: "FNU",
  temperature: "°C",
  dissolved_oxygen: "mg/L",
};

export default function Hero({ onScrollToDashboard }) {
  return (
    <section className="hero">
      <div className="hero-water">
        <FlowingWaves intensity={0.85} speed={0.4} />
      </div>
      <div className="hero-grid-bg" />
      <div className="hero-vignette" />

      <div className="hero-inner">
        <div className="hero-left">
          <motion.div
            className="hero-eyebrow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <span className="hero-dot" />
            Tampa Bay watershed · 5 stations live
          </motion.div>

          <motion.h1
            className="hero-h1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Water quality, <em>two hours</em> ahead.
          </motion.h1>

          <motion.p
            className="hero-lede"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            BayAlert ingests live USGS sensor data, detects anomalies with
            isolation forests, and propagates upstream events downstream
            through a watershed-aware cascade alert system.
          </motion.p>

          <motion.div
            className="hero-actions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <button className="btn btn-primary" onClick={onScrollToDashboard}>
              View the live dashboard
            </button>
            <a
              href="https://github.com/shivanij1203/BayAlert"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              <GitHubIcon /> View on GitHub
            </a>
          </motion.div>

          <motion.div
            className="hero-credibility"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <span className="hero-cred-text">Powered by</span>
            <a
              href="https://waterservices.usgs.gov/"
              target="_blank"
              rel="noreferrer"
              className="hero-cred-link"
            >
              USGS Water Services
            </a>
            <span className="hero-cred-dot">·</span>
            <a
              href="https://github.com/DOI-USGS/dataretrieval-python"
              target="_blank"
              rel="noreferrer"
              className="hero-cred-link"
            >
              dataretrieval
            </a>
            <span className="hero-cred-dot">·</span>
            <span className="hero-cred-text">TimescaleDB</span>
          </motion.div>
        </div>

        <motion.div
          className="hero-right"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <LiveTicker />
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Live ticker showing actual current readings from BayAlert backend.
 * Falls back to schematic if API isn't reachable.
 */
function LiveTicker() {
  const [readings, setReadings] = useState([]);
  const [sparklines, setSparklines] = useState({});
  const [recentAlert, setRecentAlert] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [latest, alerts] = await Promise.all([
          getLatestReadings(),
          getAlerts(5),
        ]);
        if (!mounted) return;

        const byStation = {};
        for (const r of latest) {
          if (!byStation[r.station_id]) byStation[r.station_id] = r;
        }
        const picks = Object.values(byStation).slice(0, 4);
        setReadings(picks);
        setRecentAlert(alerts[0] || null);
        setLoaded(true);

        // fetch 6h history per pick (in parallel) for sparklines
        const sparkResults = await Promise.all(
          picks.map((r) =>
            getStationHistory(r.station_id, r.parameter, 6)
              .then((h) => ({
                key: `${r.station_id}-${r.parameter}`,
                values: h.data?.map((d) => d.value) || [],
              }))
              .catch(() => ({ key: `${r.station_id}-${r.parameter}`, values: [] }))
          )
        );
        if (!mounted) return;
        const newSpark = {};
        for (const { key, values } of sparkResults) newSpark[key] = values;
        setSparklines(newSpark);
      } catch {
        if (mounted) setLoaded(true);
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
    <div className="ticker">
      <div className="ticker-header">
        <span className="ticker-title">Live readings</span>
        <span className="ticker-status" aria-live="polite">
          <span className="live-dot" />
          {loaded ? "Streaming" : "Connecting…"}
        </span>
      </div>

      {!loaded ? (
        <ul className="ticker-list">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="ticker-row">
              <div className="ticker-row-left">
                <Skeleton width={120} height={11} style={{ background: "rgba(255,255,255,0.08)" }} />
                <div style={{ marginTop: 4 }}>
                  <Skeleton width={80} height={9} style={{ background: "rgba(255,255,255,0.06)" }} />
                </div>
              </div>
              <div className="ticker-row-right">
                <Skeleton width={48} height={16} style={{ background: "rgba(255,255,255,0.08)" }} />
              </div>
            </li>
          ))}
        </ul>
      ) : readings.length === 0 ? (
        <FallbackSchematic />
      ) : (
        <ul className="ticker-list">
          {readings.map((r, i) => {
            const key = `${r.station_id}-${r.parameter}`;
            const series = sparklines[key] || [];
            return (
              <motion.li
                key={key}
                className="ticker-row"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
              >
                <div className="ticker-row-left">
                  <div className="ticker-station">{r.station_name}</div>
                  <div className="ticker-param">
                    {PARAM_LABELS[r.parameter] || r.parameter}
                  </div>
                </div>
                <div className="ticker-row-mid">
                  <Sparkline
                    data={series}
                    color="#22d3ee"
                    width={64}
                    height={20}
                    fill
                    ariaLabel={`6 hour trend for ${r.station_name}`}
                  />
                </div>
                <div className="ticker-row-right">
                  <div className="ticker-value">{r.value.toFixed(1)}</div>
                  <div className="ticker-unit">{PARAM_UNITS[r.parameter] || ""}</div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {recentAlert && (
        <motion.div
          className="ticker-alert"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <span className={`ticker-alert-pill ${(recentAlert.level || "").toLowerCase()}`}>
            {recentAlert.level}
          </span>
          <span className="ticker-alert-text">{recentAlert.message}</span>
        </motion.div>
      )}
    </div>
  );
}

function FallbackSchematic() {
  return (
    <svg viewBox="0 0 400 220" className="ticker-schematic">
      <path
        d="M 30 40 Q 100 60 160 90 T 290 160 T 380 200"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="32"
        strokeLinecap="round"
      />
      <motion.circle
        r="5"
        fill="#fbbf24"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 5, repeat: Infinity }}
      >
        <animateMotion dur="5s" repeatCount="indefinite"
          path="M 30 40 Q 100 60 160 90 T 290 160 T 380 200" />
      </motion.circle>
      <Station x={30} y={40} pulse />
      <Station x={210} y={120} />
      <Station x={380} y={200} />
    </svg>
  );
}

function Station({ x, y, pulse }) {
  return (
    <g>
      {pulse && (
        <motion.circle cx={x} cy={y} r={8} fill="#22d3ee" opacity={0.5}
          animate={{ r: [8, 22], opacity: [0.5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
      <circle cx={x} cy={y} r={6} fill="#22d3ee" stroke="white" strokeWidth="2" />
    </g>
  );
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}
