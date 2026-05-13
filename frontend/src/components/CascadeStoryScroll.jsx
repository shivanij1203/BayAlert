import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "motion/react";

/**
 * Scroll-driven cinematic cascade story.
 *
 * As the user scrolls through this section the watershed map plays out
 * an actual cascade event: Lithia spike → cyan pulse traveling down the
 * Alafia → Riverview → Gibsonton intake. Captions cross-fade in sync.
 *
 * Geometry is stylized (not geographic) for legibility. Station X/Y
 * positions and the river path are tuned to read at any width.
 */

const STATIONS = [
  {
    id: "lithia",
    name: "Alafia at Lithia",
    label: "T+0h · 732 µS/cm",
    role: "Upstream sensor",
    x: 820,
    y: 360,
  },
  {
    id: "riverview",
    name: "Alafia at Riverview",
    label: "T+1h 15m · 33.7k µS/cm",
    role: "Midstream",
    x: 480,
    y: 340,
  },
  {
    id: "gibsonton",
    name: "Alafia at Gibsonton",
    label: "T+3h 15m · 49.1k µS/cm",
    role: "Bay intake",
    x: 200,
    y: 320,
  },
];

// SVG path for the river — gentle curves between stations, bay mouth on the left
const RIVER_PATH =
  "M 820 360 C 720 380, 620 320, 480 340 S 320 380, 200 320 L 100 320";

// path length (matches the SVG above) — used so motion.circle along path can
// be parameterized by 0–1 with a stable baseline
const RIVER_TOTAL_LENGTH = 760;

const CAPTIONS = [
  {
    range: [0.0, 0.18],
    title: "Upstream spike at Lithia.",
    body: "Specific conductance crosses 732 µS/cm — the station's 95th-percentile threshold. BayAlert fires the cascade alert.",
  },
  {
    range: [0.18, 0.55],
    title: "3h 15m of lead time.",
    body: "Travel-time model says the front will reach the desalination intake in roughly 195 minutes. Operators are notified now, not later.",
  },
  {
    range: [0.55, 0.78],
    title: "Riverview confirms.",
    body: "The front reaches midstream and pushes Riverview past 33.3k µS/cm. The cascade prediction is validated — escalation goes out.",
  },
  {
    range: [0.78, 1.0],
    title: "Intake at Gibsonton.",
    body: "The same event hits the bay-mouth sensor at 49.1k µS/cm. Without BayAlert, this would have been the first sign of trouble.",
  },
];

export default function CascadeStoryScroll() {
  const sectionRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // smooth the raw scroll progress so motion feels heavy + cinematic
  const progress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    mass: 0.6,
  });

  // pulse position along the river: 0 → 1 over scroll 0.10 → 0.85
  const pulseT = useTransform(progress, [0.1, 0.85], [0, 1], { clamp: true });
  const pulseOpacity = useTransform(progress, [0.08, 0.1, 0.85, 0.9], [0, 1, 1, 0]);
  const riverDraw = useTransform(progress, [0.05, 0.85], [0, 1], { clamp: true });

  // station glow firings — each lights up as the pulse arrives
  const lithiaGlow = useTransform(progress, [0.02, 0.18], [0, 1], { clamp: true });
  const riverviewGlow = useTransform(progress, [0.45, 0.6], [0, 1], { clamp: true });
  const gibsontonGlow = useTransform(progress, [0.78, 0.92], [0, 1], { clamp: true });

  return (
    <div className="cascade-story" ref={sectionRef}>
      <div className="cascade-story-sticky">
        <div className="cascade-story-canvas">
          <svg
            viewBox="0 0 920 480"
            preserveAspectRatio="xMidYMid meet"
            className="cascade-svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="riverGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
              </linearGradient>
              <radialGradient id="pulseGrad">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="40%" stopColor="#67e8f9" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
              </radialGradient>
              <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* stylized Tampa Bay outline on the left */}
            <path
              d="M 30 200 C 60 240, 80 280, 70 340 C 65 380, 90 410, 130 430 L 200 430 L 200 220 C 170 200, 120 180, 80 190 Z"
              fill="rgba(14, 116, 144, 0.06)"
              stroke="rgba(15, 23, 42, 0.12)"
              strokeWidth="1"
            />

            {/* baseline river (faint) */}
            <path
              d={RIVER_PATH}
              fill="none"
              stroke="rgba(15, 23, 42, 0.18)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* drawn river — appears as scroll progresses */}
            <motion.path
              d={RIVER_PATH}
              fill="none"
              stroke="url(#riverGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ pathLength: riverDraw }}
            />

            {/* stations */}
            {STATIONS.map((s) => {
              const glowMV =
                s.id === "lithia" ? lithiaGlow :
                s.id === "riverview" ? riverviewGlow :
                gibsontonGlow;

              return (
                <StationNode
                  key={s.id}
                  station={s}
                  glow={glowMV}
                />
              );
            })}

            {/* the moving pulse — a glowing dot riding along the river path */}
            <motion.g style={{ opacity: pulseOpacity }}>
              <motion.circle r="22" fill="url(#pulseGrad)">
                <animateMotion dur="0.001s" repeatCount="0" path={RIVER_PATH} />
              </motion.circle>
              <PulseFollower path={RIVER_PATH} t={pulseT} />
            </motion.g>
          </svg>

          {/* floating captions, cross-faded by scroll progress */}
          <div className="cascade-captions">
            {CAPTIONS.map((c, i) => (
              <CascadeCaption key={i} progress={progress} caption={c} />
            ))}
          </div>

          {/* scroll hint at the very top */}
          <ScrollHint progress={progress} />
        </div>
      </div>
    </div>
  );
}

function StationNode({ station, glow }) {
  // halo radius and label opacity follow `glow` (a MotionValue 0→1)
  const haloScale = useTransform(glow, [0, 1], [0.6, 1.6]);
  const haloOpacity = useTransform(glow, [0, 0.4, 1], [0, 0.4, 0.7]);
  const dotFill = useTransform(glow, [0, 1], ["#94a3b8", "#0e7490"]);
  const labelOpacity = useTransform(glow, [0.3, 1], [0, 1], { clamp: true });
  const labelY = useTransform(glow, [0.3, 1], [10, 0], { clamp: true });

  return (
    <g transform={`translate(${station.x}, ${station.y})`}>
      <motion.circle
        r={26}
        fill="#67e8f9"
        style={{ scale: haloScale, opacity: haloOpacity, transformOrigin: "center" }}
        filter="url(#softGlow)"
      />
      <motion.circle r="7" stroke="#ffffff" strokeWidth="2" style={{ fill: dotFill }} />

      {/* role tag (always visible, dim) */}
      <text x="0" y="-32" textAnchor="middle" className="cascade-station-role">
        {station.role}
      </text>

      {/* live value label (fades in when station fires) */}
      <motion.g style={{ opacity: labelOpacity, y: labelY }}>
        <rect
          x="-90"
          y="22"
          width="180"
          height="42"
          rx="8"
          fill="rgba(255, 255, 255, 0.95)"
          stroke="rgba(14, 116, 144, 0.45)"
          strokeWidth="1"
        />
        <text x="0" y="40" textAnchor="middle" className="cascade-station-name">
          {station.name}
        </text>
        <text x="0" y="56" textAnchor="middle" className="cascade-station-value">
          {station.label}
        </text>
      </motion.g>
    </g>
  );
}

/**
 * Renders a circle that follows the SVG path at progress `t` (0..1).
 * Uses getPointAtLength on a hidden ref'd path for accuracy.
 */
function PulseFollower({ path, t }) {
  const pathRef = useRef(null);
  // We piggyback on a hidden path inside the same SVG to compute getPointAtLength.
  // The motion library subscribes to t and updates cx/cy on every frame.
  const cx = useTransform(t, (val) => {
    const p = pathRef.current;
    if (!p) return 820;
    const length = p.getTotalLength();
    const point = p.getPointAtLength(length * val);
    return point.x;
  });
  const cy = useTransform(t, (val) => {
    const p = pathRef.current;
    if (!p) return 360;
    const length = p.getTotalLength();
    const point = p.getPointAtLength(length * val);
    return point.y;
  });

  return (
    <>
      <path ref={pathRef} d={path} fill="none" stroke="none" />
      <motion.circle r="6" fill="#ffffff" style={{ cx, cy }} />
      <motion.circle r="14" fill="url(#pulseGrad)" style={{ cx, cy }} />
    </>
  );
}

function CascadeCaption({ progress, caption }) {
  const [start, end] = caption.range;
  const fadeIn = start;
  const hold = (start + end) / 2;
  const fadeOut = end;

  const opacity = useTransform(
    progress,
    [Math.max(0, fadeIn - 0.04), fadeIn + 0.02, hold, fadeOut - 0.02, fadeOut + 0.04],
    [0, 1, 1, 1, 0],
  );
  const y = useTransform(
    progress,
    [fadeIn, hold, fadeOut],
    [12, 0, -12],
  );

  return (
    <motion.div className="cascade-caption" style={{ opacity, y }}>
      <h3>{caption.title}</h3>
      <p>{caption.body}</p>
    </motion.div>
  );
}

function ScrollHint({ progress }) {
  const opacity = useTransform(progress, [0, 0.05], [1, 0]);
  return (
    <motion.div className="cascade-scroll-hint" style={{ opacity }}>
      <span>Scroll to play the cascade</span>
      <span className="cascade-scroll-arrow">↓</span>
    </motion.div>
  );
}
