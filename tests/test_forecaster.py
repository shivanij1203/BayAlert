"""
Tests for the XGBoost water quality forecaster.
"""

import pytest
import pandas as pd
import numpy as np

from ml.forecaster import WaterQualityForecaster


@pytest.fixture
def training_data():
    """Synthetic time-series data with a pattern the model can learn."""
    np.random.seed(42)
    n = 500
    t = np.arange(n)

    # create a signal with daily pattern + noise
    conductance = 500 + 50 * np.sin(2 * np.pi * t / 96) + np.random.normal(0, 10, n)

    # lag features that a model would use
    df = pd.DataFrame({"conductance": conductance})
    for lag in [1, 2, 4, 8, 16, 32]:
        df[f"conductance_lag_{lag}"] = df["conductance"].shift(lag)

    df["hour_sin"] = np.sin(2 * np.pi * (t % 96) / 96)
    df["hour_cos"] = np.cos(2 * np.pi * (t % 96) / 96)

    df = df.dropna()
    return df


class TestForecaster:
    def test_train_returns_metrics(self, training_data):
        forecaster = WaterQualityForecaster(target_col="conductance", horizon=8)
        metrics = forecaster.train(training_data)

        assert "cv_mae_mean" in metrics
        assert "cv_rmse_mean" in metrics
        assert "n_samples" in metrics
        assert "horizon_minutes" in metrics
        assert metrics["horizon_minutes"] == 120

    def test_predict_returns_array(self, training_data):
        forecaster = WaterQualityForecaster(target_col="conductance", horizon=8)
        forecaster.train(training_data)

        preds = forecaster.predict(training_data.iloc[:10])
        assert len(preds) == 10
        assert all(np.isfinite(preds))

    def test_feature_importance(self, training_data):
        forecaster = WaterQualityForecaster(target_col="conductance", horizon=8)
        forecaster.train(training_data)

        importances = forecaster.get_feature_importance(top_n=5)
        assert len(importances) == 5
        # each entry is (name, importance)
        assert all(isinstance(name, str) for name, _ in importances)
        assert all(imp >= 0 for _, imp in importances)

    def test_predict_without_train_raises(self, training_data):
        forecaster = WaterQualityForecaster(target_col="conductance")
        with pytest.raises(ValueError, match="model not trained"):
            forecaster.predict(training_data)

    def test_mae_is_reasonable(self, training_data):
        forecaster = WaterQualityForecaster(target_col="conductance", horizon=8)
        metrics = forecaster.train(training_data)

        # MAE should be well below the std of the signal (~50)
        assert metrics["cv_mae_mean"] < 50, f"MAE too high: {metrics['cv_mae_mean']}"
