import { useEffect, useState } from "react";
import { motion } from "motion/react";

import { getCascadeLeadTime } from "../services/api";
import CascadeStoryScroll from "./CascadeStoryScroll";

const DEFAULT_WINDOW_HOURS = 720; // 30 days

const PARAMETER_LABELS = {
  specific_conductance: { name: "Specific conductance", unit: "µS/cm" },
  turbidity: { name: "Turbidity", unit: "FNU" },
  temperature: { name: "Water temperature", unit: "°C" },
  dissolved_oxygen: { name: "Dissolved oxygen", unit: "mg/L" },
};

/**
 * "If BayAlert had been running..." — shows the backtest summary: how many
 * cascade-triggering events occurred, and the mean/median/max lead time the
 * system would have given operators versus intake-point detection.
 */
export default function BacktestPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCascadeLeadTime(DEFAULT_WINDOW_HOURS)
      .then((d) => {
        if (!mounted) return;
        setData(d);
      })
      .catch(() => {
        if (mounted) setError(true);
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="backtest-section" id="backtest">
      <motion.div
        className="backtest-inner"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
      >
        <p className="eyebrow">Backtest · last 30 days</p>
        <h2 className="h2">What would BayAlert have caught?</h2>
        <p className="lede">
          Every upstream turbidity exceedance in the last 30 days was replayed through
          the cascade model. These are the alerts operators would have received —
          before the same event reached the downstream intake.
        </p>
      </motion.div>

      <CascadeStoryScroll />

      <motion.div
        className="backtest-inner backtest-results"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
      >
        {!loaded ? (
          <BacktestSkeleton />
        ) : error || !data ? (
          <p className="backtest-empty">Backtest service offline — API unreachable.</p>
        ) : data.summary.event_count === 0 ? (
          <p className="backtest-empty">
            No spike events detected in this window.
          </p>
        ) : (
          <>
            <ParameterBadge summary={data.summary} />

            <div className="backtest-grid">
              <BacktestStat
                label="Events caught"
                value={data.summary.event_count}
                sub={`upstream → downstream in ${data.summary.window_hours}h`}
              />
              <BacktestStat
                label="Mean lead time"
                value={`${formatMinutes(data.summary.mean_lead_minutes)}`}
                sub="before intake would have seen it"
              />
              <BacktestStat
                label="Max lead time"
                value={`${formatMinutes(data.summary.max_lead_minutes)}`}
                sub="best-case warning"
              />
              <BacktestStat
                label="Total warning delivered"
                value={`${data.summary.total_lead_hours.toFixed(1)}h`}
                sub="aggregated across events"
              />
            </div>

            {data.events.length > 0 && (
              <div className="backtest-table" role="table" aria-label="Recent cascade events">
                <div className="backtest-row backtest-head" role="row">
                  <span role="columnheader">Upstream</span>
                  <span role="columnheader">Downstream</span>
                  <span role="columnheader" className="backtest-num">Upstream FNU</span>
                  <span role="columnheader" className="backtest-num">Lead time</span>
                </div>
                {data.events.slice(0, 6).map((ev, idx) => (
                  <div
                    key={`${ev.upstream_time}-${idx}`}
                    className="backtest-row"
                    role="row"
                  >
                    <span role="cell">
                      <strong>{ev.upstream_station_name}</strong>
                      <br />
                      <span className="backtest-time">{formatLocal(ev.upstream_time)}</span>
                    </span>
                    <span role="cell">
                      <strong>{ev.downstream_station_name}</strong>
                      <br />
                      <span className="backtest-time">{formatLocal(ev.downstream_time)}</span>
                    </span>
                    <span role="cell" className="backtest-num">
                      {ev.upstream_value.toFixed(1)}
                    </span>
                    <span role="cell" className="backtest-num backtest-lead">
                      {formatMinutes(ev.lead_minutes)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    </section>
  );
}

function ParameterBadge({ summary }) {
  const info = PARAMETER_LABELS[summary.parameter] || {
    name: summary.parameter,
    unit: "",
  };
  const thresholds = summary.thresholds || {};
  const stations = Object.keys(thresholds);

  return (
    <div className="backtest-badge" role="group" aria-label="Backtest configuration">
      <div className="backtest-badge-row">
        <span className="backtest-badge-label">Detecting</span>
        <span className="backtest-badge-value">{info.name}</span>
        <span className="backtest-badge-sep">·</span>
        <span className="backtest-badge-label">top 5% per station</span>
      </div>
      {stations.length > 0 && (
        <div className="backtest-thresholds">
          {stations.map((name) => (
            <span className="backtest-threshold-chip" key={name}>
              <span className="backtest-threshold-station">{name}</span>
              <span className="backtest-threshold-value">
                ≥ {formatThreshold(thresholds[name], info.unit)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function formatThreshold(value, unit) {
  if (!Number.isFinite(value)) return "—";
  const formatted =
    value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : value.toFixed(value >= 100 ? 0 : 1);
  return unit ? `${formatted} ${unit}` : formatted;
}

function BacktestStat({ label, value, sub }) {
  return (
    <div className="backtest-stat">
      <div className="backtest-stat-label">{label}</div>
      <div className="backtest-stat-value">{value}</div>
      {sub && <div className="backtest-stat-sub">{sub}</div>}
    </div>
  );
}

function BacktestSkeleton() {
  return (
    <div className="backtest-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="backtest-stat backtest-stat-skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}

function formatMinutes(mins) {
  if (!Number.isFinite(mins)) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatLocal(iso) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
