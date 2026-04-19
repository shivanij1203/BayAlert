import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { getForecast, getStationHistory } from "../services/api";
import { TrendingUpIcon, TrendingDownIcon, ClockIcon } from "./Icons";
import Sparkline from "./Sparkline";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";

const PARAM_LABEL = {
  turbidity: "Turbidity (FNU)",
  specific_conductance: "Conductance (µS/cm)",
};

export default function ForecastCard({ stationId, parameter = "turbidity" }) {
  const [forecast, setForecast] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stationId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getForecast(stationId, parameter),
      getStationHistory(stationId, parameter, 6).catch(() => ({ data: [] })),
    ])
      .then(([fc, hist]) => {
        if (cancelled) return;
        setForecast(fc);
        setHistory(hist.data?.map((d) => d.value) || []);
      })
      .catch(() => {
        if (!cancelled) setForecast(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stationId, parameter]);

  if (loading) {
    return (
      <motion.div
        className="card forecast-card"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="card-header">
          <h3>2-Hour Forecast</h3>
        </div>
        <div className="forecast-body">
          <div className="forecast-side">
            <Skeleton width={50} height={10} />
            <div style={{ marginTop: 6 }}><Skeleton width={70} height={20} /></div>
          </div>
          <div className="forecast-arrow"><Skeleton width={40} height={28} /></div>
          <div className="forecast-side">
            <Skeleton width={50} height={10} />
            <div style={{ marginTop: 6 }}><Skeleton width={70} height={20} /></div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <Skeleton width="100%" height={48} />
        </div>
      </motion.div>
    );
  }

  if (!forecast || forecast.error) {
    return (
      <motion.div
        className="card forecast-card"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="card-header">
          <h3>2-Hour Forecast</h3>
        </div>
        <EmptyState
          compact
          title="Forecast not available"
          hint="Need at least a few hours of recent readings to forecast."
        />
      </motion.div>
    );
  }

  const isRising = forecast.direction === "rising";
  const TrendIcon = isRising ? TrendingUpIcon : TrendingDownIcon;
  const changeColor = isRising ? "var(--color-warning)" : "var(--color-success)";

  // build a combined series: history (~24 points of 6h) + a forecast tail
  const tail = buildForecastTail(history, forecast.predicted_value, 8);
  const combined = [...history, ...tail];
  const splitIdx = history.length;

  return (
    <motion.div
      className="card forecast-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
    >
      <div className="card-header">
        <h3>2-Hour Forecast</h3>
        <span className="card-subtitle">
          <ClockIcon size={12} /> {forecast.forecast_minutes} min ahead
        </span>
      </div>

      <div className="forecast-body">
        <div className="forecast-side">
          <div className="forecast-mini-label">Current</div>
          <div className="forecast-mini-value">{forecast.current_value}</div>
        </div>

        <div className="forecast-arrow" style={{ color: changeColor }}>
          <TrendIcon size={26} color={changeColor} />
          <div className="forecast-pct">{Math.abs(forecast.change_pct)}%</div>
        </div>

        <div className="forecast-side">
          <div className="forecast-mini-label">Predicted</div>
          <div className="forecast-mini-value primary">{forecast.predicted_value}</div>
        </div>
      </div>

      {combined.length > 1 && (
        <div className="forecast-chart">
          <ForecastSplit series={combined} splitIdx={splitIdx} />
          <div className="forecast-chart-legend">
            <span><span className="dot solid" /> recent</span>
            <span><span className="dot dashed" /> forecast</span>
          </div>
        </div>
      )}

      <p className="forecast-param">{PARAM_LABEL[forecast.parameter] || forecast.parameter}</p>
    </motion.div>
  );
}

/**
 * Generates a smooth interpolation from the last historical value to the predicted value
 * across N steps. Quick and good-enough visual without needing per-step predictions.
 */
function buildForecastTail(history, target, steps) {
  if (!history.length) return [];
  const start = history[history.length - 1];
  const tail = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // ease-in-out
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    tail.push(start + (target - start) * eased);
  }
  return tail;
}

function ForecastSplit({ series, splitIdx }) {
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const w = 280;
  const h = 56;
  const stepX = w / (series.length - 1);

  const histPath = series
    .slice(0, splitIdx)
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const forecastPath = series
    .slice(splitIdx - 1)
    .map((v, i) => {
      const x = (splitIdx - 1 + i) * stepX;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const splitX = (splitIdx - 1) * stepX;

  return (
    <svg width="100%" height={h + 8} viewBox={`0 0 ${w} ${h + 8}`}>
      <defs>
        <linearGradient id="fg-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0e7490" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0e7490" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={splitX} x2={splitX} y1="0" y2={h} stroke="#cbd5e1" strokeDasharray="2 3" />
      <path d={`${histPath} L ${splitX} ${h} L 0 ${h} Z`} fill="url(#fg-area)" />
      <path d={histPath} fill="none" stroke="#0e7490" strokeWidth="1.5" />
      <path d={forecastPath} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}
