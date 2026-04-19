import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import { getStationHistory } from "../services/api";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";

const PARAM_CONFIG = {
  specific_conductance: { color: "#0891b2", unit: "µS/cm", label: "Conductance" },
  turbidity: { color: "#f59e0b", unit: "FNU", label: "Turbidity", warningLine: 15, criticalLine: 40 },
  temperature: { color: "#059669", unit: "°C", label: "Temperature" },
  dissolved_oxygen: { color: "#7c3aed", unit: "mg/L", label: "Dissolved Oxygen" },
};

export default function TrendChart({ stationId, parameter, hours = 24 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stationId || !parameter) return;
    setLoading(true);
    getStationHistory(stationId, parameter, hours)
      .then((result) => {
        const formatted = result.data.map((d) => ({
          time: new Date(d.recorded_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          value: d.value,
        }));
        setData(formatted);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [stationId, parameter, hours]);

  const config = PARAM_CONFIG[parameter] || { color: "#475569", unit: "", label: parameter };

  if (loading) {
    return (
      <div className="card chart-card" aria-busy="true">
        <div className="card-header">
          <h3>{config.label}</h3>
          <span className="card-subtitle">last {hours}h · {config.unit}</span>
        </div>
        <div className="chart-skeleton">
          <Skeleton width="100%" height={240} />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card chart-card">
        <div className="card-header">
          <h3>{config.label}</h3>
          <span className="card-subtitle">last {hours}h · {config.unit}</span>
        </div>
        <EmptyState
          title="No readings for this combination"
          hint={
            parameter === "turbidity" || parameter === "dissolved_oxygen"
              ? "Only Alafia River at Lithia reports this parameter via USGS."
              : "USGS hasn't returned data for this station + parameter recently."
          }
        />
      </div>
    );
  }

  const gradientId = `grad-${parameter}`;

  return (
    <motion.div
      className="card chart-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <div className="card-header">
        <h3>{config.label}</h3>
        <span className="card-subtitle">last {hours}h · {config.unit}</span>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={config.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
            interval={Math.max(1, Math.floor(data.length / 6))}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              boxShadow: "0 4px 24px rgba(15, 23, 42, 0.08)",
              fontSize: "12px",
            }}
            formatter={(value) => [`${value} ${config.unit}`, config.label]}
          />
          {config.warningLine && (
            <ReferenceLine
              y={config.warningLine}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{ value: "Warning", position: "right", fontSize: 10, fill: "#f59e0b" }}
            />
          )}
          {config.criticalLine && (
            <ReferenceLine
              y={config.criticalLine}
              stroke="#dc2626"
              strokeDasharray="4 4"
              label={{ value: "Critical", position: "right", fontSize: 10, fill: "#dc2626" }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={config.color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
