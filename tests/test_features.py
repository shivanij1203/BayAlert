"""
Tests for the feature engineering pipeline.
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta

from ml.features import (
    add_rolling_features,
    add_rate_of_change,
    add_lag_features,
    add_time_features,
    build_feature_matrix,
    pivot_parameters,
)


@pytest.fixture
def sample_timeseries():
    """Create a simple 24hr time series at 15-min intervals."""
    timestamps = pd.date_range(
        start="2026-02-15",
        periods=96,  # 24 hours
        freq="15min",
        tz="UTC",
    )
    np.random.seed(42)
    df = pd.DataFrame(
        {
            "conductance": np.random.normal(500, 50, 96),
            "turbidity": np.abs(np.random.normal(3, 1, 96)),
            "temperature": np.random.normal(20, 2, 96),
            "dissolved_oxygen": np.random.normal(7, 0.5, 96),
        },
        index=timestamps,
    )
    return df


@pytest.fixture
def sample_raw_df():
    """Create raw data matching the CSV format from explore_usgs notebook."""
    rows = []
    station = "TEST STATION A"
    base_time = datetime(2026, 2, 15, tzinfo=timezone.utc)

    for i in range(48):
        ts = base_time + timedelta(minutes=15 * i)
        rows.append({"value": 500 + i, "dateTime": ts, "station": station, "parameter": "Specific conductance", "param_code": 95})
        rows.append({"value": 3.0 + (i * 0.1), "dateTime": ts, "station": station, "parameter": "Turbidity", "param_code": 63680})

    return pd.DataFrame(rows)


class TestRollingFeatures:
    def test_creates_expected_columns(self, sample_timeseries):
        result = add_rolling_features(sample_timeseries, "conductance", windows=[4])
        assert "conductance_roll_4_mean" in result.columns
        assert "conductance_roll_4_std" in result.columns
        assert "conductance_roll_4_min" in result.columns
        assert "conductance_roll_4_max" in result.columns

    def test_default_windows(self, sample_timeseries):
        result = add_rolling_features(sample_timeseries, "conductance")
        # default windows: 8, 24, 96
        assert "conductance_roll_8_mean" in result.columns
        assert "conductance_roll_24_mean" in result.columns
        assert "conductance_roll_96_mean" in result.columns

    def test_rolling_mean_is_correct(self, sample_timeseries):
        result = add_rolling_features(sample_timeseries, "conductance", windows=[4])
        # manually compute rolling mean for row 4
        expected = sample_timeseries["conductance"].iloc[:4].mean()
        actual = result["conductance_roll_4_mean"].iloc[3]
        assert abs(expected - actual) < 1e-6


class TestRateOfChange:
    def test_creates_pct_change_columns(self, sample_timeseries):
        result = add_rate_of_change(sample_timeseries, "conductance", periods=[1, 4])
        assert "conductance_pct_change_1" in result.columns
        assert "conductance_pct_change_4" in result.columns

    def test_handles_zero_values(self):
        df = pd.DataFrame(
            {"value": [0, 10, 20]},
            index=pd.date_range("2026-01-01", periods=3, freq="15min"),
        )
        result = add_rate_of_change(df, "value", periods=[1])
        # division by zero should produce 0, not NaN or inf
        assert result["value_pct_change_1"].iloc[1] == 0


class TestLagFeatures:
    def test_creates_lag_columns(self, sample_timeseries):
        result = add_lag_features(sample_timeseries, "turbidity", lags=[1, 2])
        assert "turbidity_lag_1" in result.columns
        assert "turbidity_lag_2" in result.columns

    def test_lag_values_are_shifted(self, sample_timeseries):
        result = add_lag_features(sample_timeseries, "turbidity", lags=[1])
        # lag_1 at index 5 should equal original value at index 4
        assert result["turbidity_lag_1"].iloc[5] == sample_timeseries["turbidity"].iloc[4]


class TestTimeFeatures:
    def test_creates_time_columns(self, sample_timeseries):
        result = add_time_features(sample_timeseries)
        assert "hour" in result.columns
        assert "day_of_week" in result.columns
        assert "is_daytime" in result.columns
        assert "hour_sin" in result.columns
        assert "hour_cos" in result.columns

    def test_is_daytime_logic(self, sample_timeseries):
        result = add_time_features(sample_timeseries)
        # hour 12 should be daytime, hour 2 should not
        noon_rows = result[result["hour"] == 12]
        night_rows = result[result["hour"] == 2]
        assert all(noon_rows["is_daytime"] == 1)
        assert all(night_rows["is_daytime"] == 0)

    def test_cyclical_encoding_range(self, sample_timeseries):
        result = add_time_features(sample_timeseries)
        assert result["hour_sin"].between(-1, 1).all()
        assert result["hour_cos"].between(-1, 1).all()


class TestBuildFeatureMatrix:
    def test_returns_no_nans(self, sample_timeseries):
        result = build_feature_matrix(sample_timeseries, target_col="conductance")
        assert result.isna().sum().sum() == 0

    def test_has_more_columns_than_input(self, sample_timeseries):
        result = build_feature_matrix(sample_timeseries, target_col="conductance")
        assert len(result.columns) > len(sample_timeseries.columns)


class TestPivotParameters:
    def test_pivots_correctly(self, sample_raw_df):
        result = pivot_parameters(sample_raw_df, station="TEST STATION A")
        assert "conductance" in result.columns
        assert "turbidity" in result.columns
