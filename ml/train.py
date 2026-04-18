"""
Training script for BayAlert ML models.

Usage:
    python -m ml.train --data data/tampa_bay_raw.csv

Trains:
    1. Isolation Forest anomaly detector on all available parameters
    2. XGBoost forecaster for turbidity (2hr ahead)
    3. XGBoost forecaster for conductance (2hr ahead)
"""

import argparse
import json
import logging
from pathlib import Path

from ml.features import load_raw_data, pivot_parameters, build_feature_matrix
from ml.anomaly_detector import WaterQualityAnomalyDetector
from ml.forecaster import WaterQualityForecaster

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# the Lithia station has the most parameters (including turbidity)
TARGET_STATION = "ALAFIA RIVER AT LITHIA PINECREST RD AT LITHIA, FL"


def main(data_path: str):
    logger.info(f"loading data from {data_path}")
    raw_df = load_raw_data(data_path)
    logger.info(f"loaded {len(raw_df)} raw records")

    # list available stations
    stations = raw_df["station"].unique()
    logger.info(f"stations: {list(stations)}")

    # pivot the target station into a multi-column time series
    pivoted = pivot_parameters(raw_df, station=TARGET_STATION)
    logger.info(f"pivoted shape: {pivoted.shape}, columns: {list(pivoted.columns)}")

    results = {}

    # --- anomaly detector ---
    # build features for conductance (available at most stations)
    if "conductance" in pivoted.columns:
        logger.info("training anomaly detector on conductance data...")
        features_cond = build_feature_matrix(pivoted, target_col="conductance")

        detector = WaterQualityAnomalyDetector(contamination=0.05)
        det_metrics = detector.train(features_cond)
        detector.save("anomaly_conductance")
        results["anomaly_detector_conductance"] = det_metrics

    # --- anomaly detector for turbidity ---
    if "turbidity" in pivoted.columns:
        logger.info("training anomaly detector on turbidity data...")
        features_turb = build_feature_matrix(pivoted, target_col="turbidity")

        detector_turb = WaterQualityAnomalyDetector(contamination=0.05)
        det_turb_metrics = detector_turb.train(features_turb)
        detector_turb.save("anomaly_turbidity")
        results["anomaly_detector_turbidity"] = det_turb_metrics

    # --- forecaster: turbidity 2hr ahead ---
    if "turbidity" in pivoted.columns:
        logger.info("training turbidity forecaster (2hr horizon)...")
        features_turb = build_feature_matrix(pivoted, target_col="turbidity")

        forecaster_turb = WaterQualityForecaster(target_col="turbidity")
        fc_turb_metrics = forecaster_turb.train(features_turb)
        forecaster_turb.save()

        top_features = forecaster_turb.get_feature_importance(top_n=10)
        fc_turb_metrics["top_features"] = [
            {"name": name, "importance": round(float(imp), 4)}
            for name, imp in top_features
        ]
        results["forecaster_turbidity"] = fc_turb_metrics

    # --- forecaster: conductance 2hr ahead (Lithia, rich features) ---
    if "conductance" in pivoted.columns:
        logger.info("training conductance forecaster (2hr horizon)...")
        features_cond = build_feature_matrix(pivoted, target_col="conductance")

        forecaster_cond = WaterQualityForecaster(target_col="conductance")
        fc_cond_metrics = forecaster_cond.train(features_cond)
        forecaster_cond.save()

        top_features = forecaster_cond.get_feature_importance(top_n=10)
        fc_cond_metrics["top_features"] = [
            {"name": name, "importance": round(float(imp), 4)}
            for name, imp in top_features
        ]
        results["forecaster_conductance"] = fc_cond_metrics

    # --- universal conductance forecaster (uses only conductance + temperature) ---
    # this works across all 5 stations since they all have these two parameters
    logger.info("training universal conductance forecaster (works on all stations)...")
    universal_frames = []
    for station in stations:
        s_pivoted = pivot_parameters(raw_df, station=station)
        if "conductance" not in s_pivoted.columns:
            continue
        # keep only conductance and temperature (common to all stations)
        cols = [c for c in ("conductance", "temperature") if c in s_pivoted.columns]
        universal_frames.append(s_pivoted[cols])

    if universal_frames:
        import pandas as pd
        universal_df = pd.concat(universal_frames).sort_index()
        # deduplicate timestamps when stations report at the same minute
        universal_df = universal_df.groupby(universal_df.index).mean()
        features_univ = build_feature_matrix(universal_df, target_col="conductance")

        forecaster_univ = WaterQualityForecaster(target_col="conductance")
        fc_univ_metrics = forecaster_univ.train(features_univ)
        forecaster_univ.save("forecaster_conductance_universal")
        results["forecaster_conductance_universal"] = fc_univ_metrics

    # save training results
    results_path = Path(__file__).parent / "models" / "training_results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)

    logger.info(f"training complete — results saved to {results_path}")

    # print summary
    print("\n" + "=" * 60)
    print("TRAINING SUMMARY")
    print("=" * 60)
    for model_name, metrics in results.items():
        print(f"\n{model_name}:")
        for k, v in metrics.items():
            if k != "top_features":
                print(f"  {k}: {v}")
        if "top_features" in metrics:
            print("  top features:")
            for feat in metrics["top_features"][:5]:
                print(f"    {feat['name']}: {feat['importance']}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train BayAlert ML models")
    parser.add_argument("--data", default="data/tampa_bay_raw.csv", help="path to raw CSV")
    args = parser.parse_args()
    main(args.data)
