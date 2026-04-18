import { useState, useEffect } from "react";
import { getForecast } from "../services/api";

export default function ForecastCard({ stationId, parameter = "turbidity" }) {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stationId) return;

    setLoading(true);
    getForecast(stationId, parameter)
      .then(setForecast)
      .catch(() => setForecast(null))
      .finally(() => setLoading(false));
  }, [stationId, parameter]);

  if (loading) return <div className="forecast-card loading">Loading forecast...</div>;
  if (!forecast || forecast.error) return <div className="forecast-card empty">No forecast available</div>;

  const isRising = forecast.direction === "rising";
  const changeColor = isRising ? "#f44336" : "#4caf50";

  return (
    <div className="forecast-card">
      <h3>2-Hour Forecast</h3>
      <div className="forecast-body">
        <div className="forecast-current">
          <span className="label">Current</span>
          <span className="value">{forecast.current_value}</span>
        </div>
        <div className="forecast-arrow" style={{ color: changeColor }}>
          {isRising ? "▲" : "▼"} {Math.abs(forecast.change_pct)}%
        </div>
        <div className="forecast-predicted">
          <span className="label">Predicted</span>
          <span className="value">{forecast.predicted_value}</span>
        </div>
      </div>
      <p className="forecast-param">{forecast.parameter} — {forecast.forecast_minutes} min ahead</p>
    </div>
  );
}
