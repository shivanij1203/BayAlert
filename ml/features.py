"""
Feature engineering for water quality time-series data.

Takes raw USGS readings and creates features suitable for anomaly detection
and time-series forecasting. Key features include rolling statistics,
rate of change, and lag values.

Reference: patterns from water quality prediction notebooks on Kaggle
"""

import pandas as pd
import numpy as np


def load_raw_data(csv_path: str) -> pd.DataFrame:
    """Load the raw CSV exported from the exploration notebook."""
    df = pd.read_csv(csv_path)
    df["dateTime"] = pd.to_datetime(df["dateTime"], utc=True)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])
    return df


def pivot_parameters(df: pd.DataFrame, station: str) -> pd.DataFrame:
    """
    Pivot a single station's data so each parameter becomes a column.
    Resamples to 15-minute intervals and forward-fills small gaps.

    Result columns: temperature, specific_conductance, turbidity, dissolved_oxygen
    """
    station_df = df[df["station"] == station].copy()

    # map USGS parameter codes to clean names
    # handle both string and numeric param_code (CSV may strip leading zeros)
    param_map_str = {
        "00095": "conductance",
        "63680": "turbidity",
        "00010": "temperature",
        "00300": "dissolved_oxygen",
    }
    param_map_int = {
        95: "conductance",
        63680: "turbidity",
        10: "temperature",
        300: "dissolved_oxygen",
    }
    station_df["param_name"] = station_df["param_code"].map(param_map_str)
    mask = station_df["param_name"].isna()
    station_df.loc[mask, "param_name"] = station_df.loc[mask, "param_code"].map(param_map_int)
    station_df = station_df.dropna(subset=["param_name"])

    # pivot so each parameter is a column
    pivoted = station_df.pivot_table(
        index="dateTime",
        columns="param_name",
        values="value",
        aggfunc="mean",
    )

    # resample to regular 15-min intervals and fill small gaps
    pivoted = pivoted.resample("15min").mean()
    pivoted = pivoted.ffill(limit=4)  # fill up to 1 hour of gaps

    return pivoted


def add_rolling_features(df: pd.DataFrame, column: str, windows: list[int] = None) -> pd.DataFrame:
    """
    Add rolling mean, std, min, max for a given column.
    Windows are in number of 15-min intervals (e.g. 8 = 2 hours).
    """
    if windows is None:
        windows = [8, 24, 96]  # 2hr, 6hr, 24hr

    result = df.copy()

    for w in windows:
        prefix = f"{column}_roll_{w}"
        result[f"{prefix}_mean"] = result[column].rolling(window=w, min_periods=1).mean()
        result[f"{prefix}_std"] = result[column].rolling(window=w, min_periods=1).std()
        result[f"{prefix}_min"] = result[column].rolling(window=w, min_periods=1).min()
        result[f"{prefix}_max"] = result[column].rolling(window=w, min_periods=1).max()

    return result


def add_rate_of_change(df: pd.DataFrame, column: str, periods: list[int] = None) -> pd.DataFrame:
    """
    Calculate rate of change (percentage) over specified periods.
    Useful for detecting sudden spikes or drops.
    """
    if periods is None:
        periods = [1, 4, 8]  # 15min, 1hr, 2hr

    result = df.copy()

    for p in periods:
        prev = result[column].shift(p)
        # avoid division by zero
        result[f"{column}_pct_change_{p}"] = np.where(
            prev != 0,
            ((result[column] - prev) / prev) * 100,
            0,
        )

    return result


def add_lag_features(df: pd.DataFrame, column: str, lags: list[int] = None) -> pd.DataFrame:
    """
    Add lagged values of a column for time-series forecasting.
    Each lag represents a 15-minute step.
    """
    if lags is None:
        lags = [1, 2, 4, 8, 16, 32]  # 15min to 8hr back

    result = df.copy()

    for lag in lags:
        result[f"{column}_lag_{lag}"] = result[column].shift(lag)

    return result


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Extract temporal features from the datetime index.
    Tidal and weather patterns often follow daily/weekly cycles.
    """
    result = df.copy()
    result["hour"] = result.index.hour
    result["day_of_week"] = result.index.dayofweek
    result["is_daytime"] = ((result["hour"] >= 6) & (result["hour"] <= 18)).astype(int)

    # cyclical encoding for hour (captures circular nature of time)
    result["hour_sin"] = np.sin(2 * np.pi * result["hour"] / 24)
    result["hour_cos"] = np.cos(2 * np.pi * result["hour"] / 24)

    return result


def build_feature_matrix(df: pd.DataFrame, target_col: str) -> pd.DataFrame:
    """
    Full feature engineering pipeline for a single station.
    Combines rolling stats, rate of change, lags, and time features.
    """
    result = df.copy()

    # add features for the target column
    result = add_rolling_features(result, target_col)
    result = add_rate_of_change(result, target_col)
    result = add_lag_features(result, target_col)

    # add features for other available columns
    for col in df.columns:
        if col != target_col and not df[col].isna().all():
            result = add_rolling_features(result, col, windows=[8, 24])
            result = add_lag_features(result, col, lags=[1, 4, 8])

    # add time-based features
    result = add_time_features(result)

    # drop rows with NaN from lag/rolling calculations
    result = result.dropna()

    return result
