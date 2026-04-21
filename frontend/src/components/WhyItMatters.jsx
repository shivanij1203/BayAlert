import { motion } from "motion/react";

export default function WhyItMatters() {
  return (
    <section className="why" id="why-it-matters">
      <div className="why-inner">
        <motion.div
          className="why-intro"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="eyebrow">The problem</p>
          <h2 className="h2">By the time the plant detects it,<br />it&apos;s already too late.</h2>
          <p className="lede">
            The Tampa Bay Seawater Desalination Plant relies on intake-point sensors.
            When turbidity or salinity spikes hit those sensors, treatment is already at risk.
            Operators get minutes of warning, not hours.
          </p>
        </motion.div>

        <div className="why-compare">
          <motion.div
            className="why-col why-col-bad"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="why-col-label">Without BayAlert</div>
            <Timeline
              steps={[
                { time: "T+0h", label: "Event upstream", state: "" },
                { time: "T+3h", label: "Reaches midstream", state: "" },
                { time: "T+5h", label: "Hits intake sensor", state: "alert" },
                { time: "T+5h 02m", label: "Operator notified", state: "alert" },
              ]}
              variant="bad"
            />
            <p className="why-col-foot">
              Reactive monitoring · ~2 minutes to respond
            </p>
          </motion.div>

          <motion.div
            className="why-col why-col-good"
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="why-col-label">With BayAlert</div>
            <Timeline
              steps={[
                { time: "T+0h", label: "Event upstream", state: "ok" },
                { time: "T+0h 01m", label: "Cascade alert fires", state: "ok" },
                { time: "T+2h", label: "2hr forecast confirms", state: "ok" },
                { time: "T+5h", label: "Pre-positioned response", state: "ok" },
              ]}
              variant="good"
            />
            <p className="why-col-foot">
              Predictive monitoring · ~5 hours of lead time
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Timeline({ steps, variant }) {
  return (
    <ul className={`timeline timeline-${variant}`}>
      {steps.map((s, i) => (
        <motion.li
          key={i}
          className={`timeline-step ${s.state}`}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 0.2 + i * 0.1 }}
        >
          <div className="timeline-marker" />
          <div className="timeline-content">
            <span className="timeline-time">{s.time}</span>
            <span className="timeline-label">{s.label}</span>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
