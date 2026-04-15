"""
Tests for the Isolation Forest anomaly detector.
"""

import pytest
import pandas as pd
import numpy as np
from pathlib import Path

from ml.anomaly_detector import WaterQualityAnomalyDetector


@pytest.fixture
def normal_data():
    """Synthetic normal water quality readings."""
    np.random.seed(42)
    n = 500
    return pd.DataFrame({
        "conductance": np.random.normal(500, 30, n),
        "turbidity": np.abs(np.random.normal(3, 1, n)),
        "temperature": np.random.normal(20, 2, n),
    })


@pytest.fixture
def data_with_anomalies():
    """Synthetic data with injected anomalies."""
    np.random.seed(42)
    n = 500
    conductance = np.random.normal(500, 30, n)
    turbidity = np.abs(np.random.normal(3, 1, n))
    temperature = np.random.normal(20, 2, n)

    # inject obvious anomalies at known positions
    conductance[10] = 900   # spike
    conductance[50] = 100   # drop
    turbidity[20] = 60      # huge spike
    turbidity[80] = 50      # huge spike

    return pd.DataFrame({
        "conductance": conductance,
        "turbidity": turbidity,
        "temperature": temperature,
    })


class TestAnomalyDetector:
    def test_train_returns_metrics(self, normal_data):
        detector = WaterQualityAnomalyDetector(contamination=0.05)
        metrics = detector.train(normal_data)

        assert "samples" in metrics
        assert "anomalies_detected" in metrics
        assert "anomaly_rate" in metrics
        assert metrics["samples"] == 500

    def test_predict_adds_columns(self, normal_data):
        detector = WaterQualityAnomalyDetector(contamination=0.05)
        detector.train(normal_data)

        result = detector.predict(normal_data)
        assert "anomaly_score" in result.columns
        assert "is_anomaly" in result.columns

    def test_detects_obvious_anomalies(self, data_with_anomalies):
        detector = WaterQualityAnomalyDetector(contamination=0.05)
        detector.train(data_with_anomalies)

        result = detector.predict(data_with_anomalies)
        anomaly_indices = result[result["is_anomaly"]].index.tolist()

        # at least some of our injected anomalies should be caught
        injected = {10, 20, 50, 80}
        detected = set(anomaly_indices)
        overlap = injected & detected
        assert len(overlap) >= 2, f"expected at least 2 injected anomalies detected, got {overlap}"

    def test_predict_without_train_raises(self, normal_data):
        detector = WaterQualityAnomalyDetector()
        with pytest.raises(ValueError, match="model not trained"):
            detector.predict(normal_data)

    def test_save_and_load(self, normal_data, tmp_path):
        import ml.anomaly_detector as ad_module
        original_dir = ad_module.MODEL_DIR
        ad_module.MODEL_DIR = tmp_path

        try:
            detector = WaterQualityAnomalyDetector(contamination=0.05)
            detector.train(normal_data)
            detector.save("test_model")

            loaded = WaterQualityAnomalyDetector()
            loaded.load("test_model")

            # predictions should match
            original_pred = detector.predict(normal_data)["anomaly_score"]
            loaded_pred = loaded.predict(normal_data)["anomaly_score"]
            np.testing.assert_array_almost_equal(original_pred, loaded_pred)
        finally:
            ad_module.MODEL_DIR = original_dir
