import { motion } from "motion/react";

/**
 * Tiny inline SVG sparkline. Pure presentation — give it an array of numbers.
 *
 * Props:
 *   data: number[]
 *   color: stroke color (default: currentColor)
 *   width / height: in CSS pixels
 *   strokeWidth: line thickness
 *   fill: if true, draws a soft area under the line
 *   animated: if true, draws the line in on mount
 */
export default function Sparkline({
  data = [],
  color = "currentColor",
  width = 80,
  height = 24,
  strokeWidth = 1.5,
  fill = false,
  animated = false,
  ariaLabel,
}) {
  if (!data || data.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel || "no data"}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel || "trend"}
      style={{ overflow: "visible" }}
    >
      {fill && (
        <path
          d={areaPath}
          fill={color}
          fillOpacity={0.12}
        />
      )}
      {animated ? (
        <motion.path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      ) : (
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={color} />
    </svg>
  );
}
