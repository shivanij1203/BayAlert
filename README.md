# BayAlert

Real-time water quality monitoring and alert system for Tampa Bay. Ingests live sensor data from USGS stations, detects anomalies using Isolation Forest, forecasts conditions 2 hours ahead with XGBoost, and propagates upstream events downstream through a watershed-aware cascade alert system.

## The Problem

Tampa Bay's drinking water infrastructure depends on stable water quality. Turbidity spikes, salinity changes, and red tide events can disrupt operations at treatment plants — but current monitoring systems only detect problems **after** they reach critical infrastructure. BayAlert predicts events before they arrive, using upstream sensor signals and ML-based forecasting.

## How It Works

```
USGS Sensors (5 Tampa Bay stations, 15-min intervals)
    │
    ▼
Celery Beat (automated ingestion every 15 min)
    │
    ▼
TimescaleDB (time-series storage with hypertables)
    │
    ├──▶ Isolation Forest (anomaly detection)
    ├──▶ XGBoost (2hr ahead forecasting)
    └──▶ Cascade Engine (upstream → downstream propagation alerts)
            │
            ▼
    Redis Pub/Sub → WebSocket → React Dashboard
```

### Cascade Alert System

The key differentiator. BayAlert models the Tampa Bay watershed as a directed graph:

```
Alafia River at Lithia (upstream, 35 km)
    │  ~3 hours
    ▼
Alafia River at Riverview (midstream, 15 km)
    │  ~2 hours
    ▼
Alafia River at Gibsonton (bay mouth, 5 km)
    │
    ▼
Tampa Bay → Desalination Plant
```

When turbidity spikes at the upstream Lithia station, BayAlert automatically alerts downstream stations with estimated arrival times — hours before the event reaches them.

## Monitoring Stations

| Station | Location | Parameters |
|---------|----------|------------|
| Alafia River at Lithia | Upstream, 35 km | Conductance, Turbidity, Temperature, Dissolved Oxygen |
| Alafia River at Riverview | Midstream, 15 km | Conductance, Temperature |
| Alafia River at Gibsonton | Bay mouth, 5 km | Conductance, Temperature |
| Hillsborough River at Tampa | Tidal zone, 3 km | Conductance, Temperature |
| Manatee River at Rye | Separate watershed, 25 km | Conductance, Temperature |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Data Ingestion | USGS `dataretrieval` (official Python package) |
| Database | PostgreSQL + TimescaleDB (time-series hypertables) |
| Cache / Pub-Sub | Redis |
| Task Scheduler | Celery Beat (15-min ingestion cycle) |
| Backend | FastAPI (REST + WebSocket) |
| ML — Anomaly Detection | Isolation Forest (scikit-learn) |
| ML — Forecasting | XGBoost with time-series cross-validation |
| Frontend | React + Recharts + Leaflet.js |
| Infrastructure | Docker Compose |

## ML Model Performance

**Anomaly Detection (Isolation Forest)**
- Trained on 2,729 samples from Alafia River at Lithia
- 5% contamination threshold → 137 anomalies flagged
- Detects turbidity spikes and conductance drops

**Turbidity Forecaster (XGBoost, 2hr horizon)**
- MAE: 0.94 FNU (baseline ~3-5 FNU)
- Top features: dissolved oxygen rolling max, turbidity rolling min, turbidity rolling mean

**Conductance Forecaster (XGBoost, 2hr horizon)**
- MAE: 19.8 µS/cm (baseline ~500 µS/cm, <4% error)
- Top features: conductance rolling min, conductance current, conductance lag-1

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/readings/latest` | Latest readings per station + parameter |
| GET | `/api/readings/history/{station_id}` | Time-series history |
| GET | `/api/readings/stations` | List all stations with data |
| GET | `/api/alerts/` | Recent alerts |
| WS | `/api/alerts/ws` | Real-time alert stream |
| GET | `/api/predictions/anomalies/{station_id}` | Run anomaly detection |
| GET | `/api/predictions/forecast/{station_id}` | 2hr forecast |
| GET | `/api/cascade/topology` | Watershed graph |
| POST | `/api/cascade/check` | Trigger cascade check |

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Python 3.11+
- Node.js 18+

### Run with Docker

```bash
docker-compose up --build
```

This starts PostgreSQL/TimescaleDB, Redis, FastAPI, and Celery workers.

### Run locally (development)

```bash
# backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# train ML models
cd ..
pip install -r ml/requirements.txt
python -m ml.train --data data/tampa_bay_raw.csv

# frontend
cd frontend
npm install
npm run dev
```

### Run tests

```bash
pytest tests/ -v
```

## Project Structure

```
BayAlert/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # FastAPI app
│       ├── config.py               # stations, thresholds
│       ├── database.py             # TimescaleDB setup
│       ├── models/                 # SQLAlchemy models
│       ├── routers/                # REST + WebSocket endpoints
│       ├── services/
│       │   ├── ingest.py           # USGS data pipeline
│       │   ├── alerts.py           # threshold-based alerts
│       │   ├── cascade.py          # cross-station propagation
│       │   └── predict.py          # ML inference service
│       └── tasks/
│           └── worker.py           # Celery scheduled tasks
├── ml/
│   ├── features.py                 # feature engineering
│   ├── anomaly_detector.py         # Isolation Forest
│   ├── forecaster.py               # XGBoost 2hr predictor
│   ├── train.py                    # training script
│   └── models/                     # trained model files
├── notebooks/
│   └── explore_usgs.ipynb          # data exploration
├── tests/                          # pytest test suite
└── data/
    └── tampa_bay_raw.csv           # 30 days USGS sensor data
```

## Data Sources

- [USGS Water Services API](https://waterservices.usgs.gov/)
- [USGS dataretrieval-python](https://github.com/DOI-USGS/dataretrieval-python)
- [Tampa Bay Estuary Program](https://tbep-tech.github.io/)

## References

- [Isolation Forest for Environmental Monitoring (MDPI 2025)](https://www.mdpi.com/2076-3298/12/4/116)
- [waasiq/water-quality-anomaly-detection](https://github.com/waasiq/water-quality-anomaly-detection) — Isolation Forest approach
- [sintel-dev/Orion](https://github.com/sintel-dev/Orion) — time-series anomaly detection patterns
- [testdrivenio/fastapi-celery](https://github.com/testdrivenio/fastapi-celery) — Celery + FastAPI patterns
- [jmitchel3/timescaledb-python](https://github.com/jmitchel3/timescaledb-python) — TimescaleDB + FastAPI
