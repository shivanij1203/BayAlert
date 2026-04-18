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

export function getAlerts(limit = 50) {
  return api.get("/alerts/", { params: { limit } }).then((r) => r.data);
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
