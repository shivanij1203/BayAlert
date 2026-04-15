"""
BayAlert — Tampa Bay Water Quality Monitoring & Alert System

Real-time ingestion of USGS sensor data, anomaly detection,
and alert distribution for Tampa Bay watershed stations.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import readings, alerts, predictions

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and hypertables on startup."""
    logger.info("initializing database...")
    init_db()
    logger.info("database ready")
    yield


app = FastAPI(
    title="BayAlert",
    description="Tampa Bay water quality monitoring and alert system",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(readings.router)
app.include_router(alerts.router)
app.include_router(predictions.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "bayalert"}
