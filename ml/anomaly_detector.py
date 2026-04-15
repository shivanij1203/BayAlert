"""
Anomaly detection for water quality sensor data.

Uses Isolation Forest as the primary detector — research shows it outperforms
Random Forest, Logistic Regression, and Local Outlier Factor for water quality
anomaly detection.

Reference: waasiq/water-quality-anomaly-detection (GitHub)
Reference: sintel-dev/Orion time-series anomaly detection patterns
"""

import logging
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)


class WaterQualityAnomalyDetector:
    """
    Isolation Forest based anomaly detector for water quality readings.
    Trained on normal operating data, flags unusual patterns as anomalies.
    """

    def __init__(self, contamination: float = 0.05, random_state: int = 42):
        """
        Args:
            contamination: expected proportion of anomalies in the data (0.0 to 0.5)
            random_state: reproducibility seed
        """
        self.contamination = contamination
        self.random_state = random_state
        self.model = None
        self.scaler = StandardScaler()
        self.feature_columns = None

    def train(self, df: pd.DataFrame, feature_cols: list[str] = None):
        """
        Train the Isolation Forest on historical data.

        Args:
            df: feature matrix from features.build_feature_matrix()
            feature_cols: columns to use as features (if None, uses all numeric)
        """
        if feature_cols is None:
            feature_cols = [c for c in df.select_dtypes(include=[np.number]).columns]

        self.feature_columns = feature_cols
        X = df[feature_cols].values

        # scale features — Isolation Forest works better with normalized data
        X_scaled = self.scaler.fit_transform(X)

        self.model = IsolationForest(
            contamination=self.contamination,
            n_estimators=200,
            max_samples="auto",
            random_state=self.random_state,
            n_jobs=-1,
        )
        self.model.fit(X_scaled)

        # get anomaly scores on training data for threshold calibration
        scores = self.model.decision_function(X_scaled)
        predictions = self.model.predict(X_scaled)

        n_anomalies = (predictions == -1).sum()
        logger.info(
            f"trained on {len(X)} samples | "
            f"detected {n_anomalies} anomalies ({n_anomalies/len(X)*100:.1f}%)"
        )

        return {
            "samples": len(X),
            "anomalies_detected": int(n_anomalies),
            "anomaly_rate": round(n_anomalies / len(X) * 100, 2),
            "score_threshold": float(self.model.offset_),
        }

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Score new data for anomalies.

        Returns DataFrame with added columns:
            - anomaly_score: raw score (lower = more anomalous)
            - is_anomaly: boolean flag
        """
        if self.model is None:
            raise ValueError("model not trained — call train() first")

        X = df[self.feature_columns].values
        X_scaled = self.scaler.transform(X)

        scores = self.model.decision_function(X_scaled)
        predictions = self.model.predict(X_scaled)

        result = df.copy()
        result["anomaly_score"] = scores
        result["is_anomaly"] = predictions == -1

        return result

    def save(self, name: str = "anomaly_detector"):
        """Save trained model and scaler to disk."""
        model_path = MODEL_DIR / f"{name}.pkl"
        with open(model_path, "wb") as f:
            pickle.dump({
                "model": self.model,
                "scaler": self.scaler,
                "feature_columns": self.feature_columns,
                "contamination": self.contamination,
            }, f)
        logger.info(f"model saved to {model_path}")

    def load(self, name: str = "anomaly_detector"):
        """Load a previously trained model from disk."""
        model_path = MODEL_DIR / f"{name}.pkl"
        with open(model_path, "rb") as f:
            data = pickle.load(f)

        self.model = data["model"]
        self.scaler = data["scaler"]
        self.feature_columns = data["feature_columns"]
        self.contamination = data["contamination"]
        logger.info(f"model loaded from {model_path}")
