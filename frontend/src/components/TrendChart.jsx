import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { getStationHistory } from "../services/api";

const PARAM_CONFIG = {
  specific_conductance: { color: "#2196f3", unit: "µS/cm", label: "Conductance" },
  turbidity: { color: "#ff9800", unit: "FNU", label: "Turbidity", warningLine: 15, criticalLine: 40 },
  temperature: { color: "#4caf50", unit: "°C", label: "Temperature" },
  dissolved_oxygen: { color: "#9c27b0", unit: "mg/L", label: "Dissolved Oxygen" },
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
          fullTime: d.recorded_at,
        }));
        setData(formatted);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [stationId, parameter, hours]);

  const config = PARAM_CONFIG[parameter] || {
    color: "#666",
    unit: "",
    label: parameter,
  };

  if (loading) return <div className="chart-loading">Loading chart...</div>;
  if (data.length === 0) return <div className="chart-empty">No data available</div>;

  return (
    <div className="trend-chart">
      <h3>{config.label} — last {hours}h</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11 }}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis tick={{ fontSize: 11 }} unit={` ${config.unit}`} />
          <Tooltip
            formatter={(value) => [`${value} ${config.unit}`, config.label]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={config.color}
            strokeWidth={2}
            dot={false}
          />
          {config.warningLine && (
            <ReferenceLine
              y={config.warningLine}
              stroke="#ff9800"
              strokeDasharray="5 5"
              label={{ value: "Warning", position: "right", fontSize: 10 }}
            />
          )}
          {config.criticalLine && (
            <ReferenceLine
              y={config.criticalLine}
              stroke="#f44336"
              strokeDasharray="5 5"
              label={{ value: "Critical", position: "right", fontSize: 10 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
