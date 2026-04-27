import axios from "axios";

const API_BASE = "http://localhost:8000/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export function getStations() {
  return api.get("/readings/stations").then((r) => r.data);
}

export function getLatestReadings() {
  return api.get("/readings/latest").then((r) => r.data);
}

export function getStationHistory(stationId, parameter, hours = 24) {
  return api
    .get(`/readings/history/${stationId}`, { params: { parameter, hours } })
    .then((r) => r.data);
}

export function getAlerts(limit = 50, { unresolvedOnly } = {}) {
  const params = { limit };
  if (unresolvedOnly) params.unresolved_only = true;
  return api.get("/alerts/", { params }).then((r) => r.data);
}

export function acknowledgeAlert(alertId, operator, notes) {
  return api
    .post(`/alerts/${alertId}/ack`, { operator, notes })
    .then((r) => r.data);
}

export function resolveAlert(alertId, { operator, feedback = "confirmed", notes } = {}) {
  return api
    .post(`/alerts/${alertId}/resolve`, { operator, feedback, notes })
    .then((r) => r.data);
}

export function getAlertDeliveries(alertId) {
  return api.get(`/alerts/${alertId}/deliveries`).then((r) => r.data);
}

export function getAnomalies(stationId, parameter = "conductance") {
  return api
    .get(`/predictions/anomalies/${stationId}`, { params: { parameter } })
    .then((r) => r.data);
}

export function getForecast(stationId, parameter = "turbidity") {
  return api
    .get(`/predictions/forecast/${stationId}`, { params: { parameter } })
    .then((r) => r.data);
}

export function getWatershedTopology() {
  return api.get("/cascade/topology").then((r) => r.data);
}

export function triggerCascadeCheck() {
  return api.post("/cascade/check").then((r) => r.data);
}

export function getEnvironmentalLatest() {
  return api.get("/environmental/latest").then((r) => r.data);
}

export function getRainForecast() {
  return api.get("/environmental/rain-forecast").then((r) => r.data);
}

export function getEnvironmentalHistory(source, parameter, { hours = 24, stationId } = {}) {
  const params = { source, parameter, hours };
  if (stationId) params.station_id = stationId;
  return api.get("/environmental/history", { params }).then((r) => r.data);
}
