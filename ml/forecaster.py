"""
Time-series forecasting for water quality parameters.

Predicts values 2 hours ahead (8 x 15-min intervals) using XGBoost
with lag features. XGBoost is used over LSTM here because:
- works well with limited data (30 days)
- fast to train and iterate on
- interpretable feature importances

For production with months of data, LSTM/GRU would be a better choice.
Reference: qin67/Time-series-data-prediction (GitHub)
"""

import logging
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

# 8 steps = 2 hours at 15-min intervals
FORECAST_HORIZON = 8


class WaterQualityForecaster:
    """
    XGBoost-based forecaster that predicts a target parameter
    N steps ahead using lag features and rolling statistics.
    """

    def __init__(self, target_col: str, horizon: int = FORECAST_HORIZON):
        """
        Args:
            target_col: name of the column to forecast
            horizon: number of 15-min steps to forecast ahead (8 = 2 hours)
        """
        self.target_col = target_col
        self.horizon = horizon
        self.model = None
        self.feature_columns = None

    def prepare_target(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create the target variable: value N steps into the future."""
        result = df.copy()
        result[f"{self.target_col}_target"] = result[self.target_col].shift(-self.horizon)
        result = result.dropna(subset=[f"{self.target_col}_target"])
        return result

    def train(self, df: pd.DataFrame, feature_cols: list[str] = None) -> dict:
        """
        Train the XGBoost forecaster using time-series cross-validation.

        Args:
            df: feature matrix with the target column and lag/rolling features
            feature_cols: which columns to use as predictors
        """
        df = self.prepare_target(df)

        if feature_cols is None:
            exclude = [f"{self.target_col}_target", "hour", "day_of_week"]
            feature_cols = [
                c for c in df.select_dtypes(include=[np.number]).columns
                if c not in exclude
            ]

        self.feature_columns = feature_cols
        target = f"{self.target_col}_target"

        X = df[feature_cols].values
        y = df[target].values

        # time-series cross-validation (no shuffling — respects time order)
        tscv = TimeSeriesSplit(n_splits=5)
        mae_scores = []
        rmse_scores = []

        for train_idx, val_idx in tscv.split(X):
            X_train, X_val = X[train_idx], X[val_idx]
            y_train, y_val = y[train_idx], y[val_idx]

            model = XGBRegressor(
                n_estimators=200,
                max_depth=6,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
            )
            model.fit(
                X_train, y_train,
                eval_set=[(X_val, y_val)],
                verbose=False,
            )

            preds = model.predict(X_val)
            mae_scores.append(mean_absolute_error(y_val, preds))
            rmse_scores.append(np.sqrt(mean_squared_error(y_val, preds)))

        # train final model on all data
        self.model = XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
        )
        self.model.fit(X, y, verbose=False)

        metrics = {
            "target": self.target_col,
            "horizon_steps": self.horizon,
            "horizon_minutes": self.horizon * 15,
            "cv_mae_mean": round(float(np.mean(mae_scores)), 4),
            "cv_mae_std": round(float(np.std(mae_scores)), 4),
            "cv_rmse_mean": round(float(np.mean(rmse_scores)), 4),
            "cv_rmse_std": round(float(np.std(rmse_scores)), 4),
            "n_features": len(feature_cols),
            "n_samples": len(X),
        }

        logger.info(
            f"forecaster trained | target={self.target_col} | "
            f"horizon={self.horizon * 15}min | "
            f"MAE={metrics['cv_mae_mean']:.4f} ± {metrics['cv_mae_std']:.4f}"
        )

        return metrics

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        """Predict the target value N steps ahead for each row."""
        if self.model is None:
            raise ValueError("model not trained — call train() first")

        X = df[self.feature_columns].values
        return self.model.predict(X)

    def get_feature_importance(self, top_n: int = 15) -> list[tuple[str, float]]:
        """Return top N most important features."""
        if self.model is None:
            return []

        importances = self.model.feature_importances_
        pairs = list(zip(self.feature_columns, importances))
        pairs.sort(key=lambda x: x[1], reverse=True)
        return pairs[:top_n]

    def save(self, name: str = None):
        """Save trained model to disk."""
        if name is None:
            name = f"forecaster_{self.target_col}"

        model_path = MODEL_DIR / f"{name}.pkl"
        with open(model_path, "wb") as f:
            pickle.dump({
                "model": self.model,
                "feature_columns": self.feature_columns,
                "target_col": self.target_col,
                "horizon": self.horizon,
            }, f)
        logger.info(f"forecaster saved to {model_path}")

    def load(self, name: str = None):
        """Load a previously trained model from disk."""
        if name is None:
            name = f"forecaster_{self.target_col}"

        model_path = MODEL_DIR / f"{name}.pkl"
        with open(model_path, "rb") as f:
            data = pickle.load(f)

        self.model = data["model"]
        self.feature_columns = data["feature_columns"]
        self.target_col = data["target_col"]
        self.horizon = data["horizon"]
        logger.info(f"forecaster loaded from {model_path}")
