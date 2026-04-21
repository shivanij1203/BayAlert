import { motion } from "motion/react";

export default function HowItWorks() {
  return (
    <section className="how" id="how-it-works">
      <motion.div
        className="how-intro"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
      >
        <p className="eyebrow">Architecture</p>
        <h2 className="h2">A pipeline, not a dashboard.</h2>
        <p className="lede">
          Most water monitoring stops at displaying live data. BayAlert
          actively predicts threats and propagates them through the watershed.
        </p>
      </motion.div>

      <div className="how-rows">
        <Row
          num="01"
          label="Ingest"
          title="USGS sensors → TimescaleDB"
          body="A Celery worker pulls instantaneous values from the USGS Water Services API every 15 minutes for 5 stations across the Alafia, Hillsborough, and Manatee rivers. Readings land in a PostgreSQL hypertable."
          code="POST /tasks · ingest_usgs · 363 readings"
          delay={0}
        />
        <Row
          num="02"
          label="Detect"
          title="Isolation Forest flags anomalies"
          body="Scikit-learn's IsolationForest scores each new reading against the station's recent distribution. Threshold breaches (turbidity > 40 FNU, conductance spikes vs 24h mean) become alerts."
          code="anomaly_score < threshold · publish to Redis"
          delay={0.08}
        />
        <Row
          num="03"
          label="Forecast"
          title="XGBoost predicts 2 hours ahead"
          body="Time-series cross-validated XGBoost models forecast turbidity and conductance. A universal model trained on common features generalizes across all 5 stations."
          code="MAE 0.94 FNU · 120 min horizon"
          delay={0.16}
          visual={<ForecastSparkline />}
        />
        <Row
          num="04"
          label="Cascade"
          title="Upstream events warn downstream stations"
          body="When turbidity spikes at upstream Lithia, the watershed graph estimates river travel time and creates pre-arrival alerts at Riverview and Gibsonton — hours before the event reaches the desalination plant."
          code="Lithia → Riverview (~3h) → Gibsonton (~5h)"
          delay={0.24}
          visual={<CascadeDiagram />}
        />
      </div>
    </section>
  );
}

function Row({ num, label, title, body, code, visual, delay = 0 }) {
  return (
    <motion.div
      className="how-row"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay }}
    >
      <div className="how-row-num">
        <span className="how-row-label">{label}</span>
        <span className="how-row-step">{num}</span>
      </div>
      <div className="how-row-content">
        <h3 className="how-row-title">{title}</h3>
        <p className="how-row-body">{body}</p>
        <code className="how-row-code">{code}</code>
        {visual && <div className="how-row-visual">{visual}</div>}
      </div>
    </motion.div>
  );
}

/** Mini sparkline showing a current reading + extending forecast */
function ForecastSparkline() {
  // 12 historical points + 8 forecast points
  const history = [22, 24, 23, 26, 28, 31, 35, 38, 42, 40, 38, 42];
  const forecast = [40, 35, 30, 24, 20, 18, 16, 16];
  const all = [...history, ...forecast];
  const max = Math.max(...all);
  const min = Math.min(...all);
  const range = max - min || 1;
  const w = 320;
  const h = 80;
  const stepX = w / (all.length - 1);

  function pathFor(values, startIdx) {
    return values
      .map((v, i) => {
        const x = (startIdx + i) * stepX;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }

  const splitX = (history.length - 1) * stepX;

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${w} ${h + 20}`} width="100%" height="100">
        <defs>
          <linearGradient id="sl-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={splitX} x2={splitX} y1="0" y2={h} stroke="rgba(255,255,255,0.4)" strokeDasharray="2 3" />
        <text x={splitX + 4} y={12} fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="JetBrains Mono">now</text>

        {/* historical area + line */}
        <motion.path
          d={`${pathFor(history, 0)} L ${splitX} ${h} L 0 ${h} Z`}
          fill="url(#sl-grad)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        />
        <motion.path
          d={pathFor(history, 0)}
          fill="none"
          stroke="#67e8f9"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.3 }}
        />

        {/* forecast (dashed) */}
        <motion.path
          d={pathFor(forecast, history.length - 1)}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeDasharray="4 4"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 1.2 }}
        />

        {/* end marker */}
        <motion.circle
          cx={(all.length - 1) * stepX}
          cy={h - ((all[all.length - 1] - min) / range) * h}
          r="3"
          fill="#22d3ee"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 2 }}
        />
      </svg>
      <div className="sparkline-legend">
        <span><span className="dot solid" /> last 3 hours</span>
        <span><span className="dot dashed" /> 2hr forecast</span>
      </div>
    </div>
  );
}

/** Inline cascade diagram showing 3 stations and propagation arrows */
function CascadeDiagram() {
  return (
    <div className="cascade-diagram">
      <svg viewBox="0 0 480 60" width="100%">
        {/* connecting line */}
        <line x1="40" x2="440" y1="30" y2="30" stroke="#cbd5e1" strokeWidth="1.5" />
        <motion.line
          x1="40" x2="440" y1="30" y2="30"
          stroke="#0e7490"
          strokeWidth="2"
          strokeDasharray="6 6"
          initial={{ strokeDashoffset: 600 }}
          whileInView={{ strokeDashoffset: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 2 }}
        />

        {/* stations */}
        <CascadeStation cx={40} label="Lithia" sub="upstream" alert />
        <CascadeStation cx={240} label="Riverview" sub="+ ~3h" />
        <CascadeStation cx={440} label="Gibsonton" sub="+ ~5h" />
      </svg>
    </div>
  );
}

function CascadeStation({ cx, label, sub, alert }) {
  return (
    <g>
      {alert && (
        <motion.circle
          cx={cx} cy={30} r={10}
          fill="#dc2626" opacity={0.4}
          animate={{ r: [10, 20], opacity: [0.4, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      <circle cx={cx} cy={30} r={6} fill={alert ? "#dc2626" : "#0e7490"} stroke="white" strokeWidth="2" />
      <text x={cx} y={14} textAnchor="middle" fontSize="10" fill="#111827" fontWeight="600">{label}</text>
      <text x={cx} y={52} textAnchor="middle" fontSize="9" fill="#6b7280" fontFamily="JetBrains Mono">{sub}</text>
    </g>
  );
}
