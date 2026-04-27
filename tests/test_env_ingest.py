"""Tests for NOAA weather + tide ingestion service."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest

from backend.app.services.env_ingest import (
    EnvPoint,
    _parse_coops_timestamp,
    fetch_tide_latest,
    fetch_weather_for_point,
)


class TestTimestampParsing:
    def test_parses_coops_timestamp_as_utc(self):
        dt = _parse_coops_timestamp("2026-04-21 17:18")
        assert dt == datetime(2026, 4, 21, 17, 18, tzinfo=timezone.utc)


class TestFetchTideLatest:
    @pytest.mark.unit
    def test_builds_env_points_from_json(self):
        payloads = {
            "water_level": {"data": [{"t": "2026-04-21 12:00", "v": "0.62"}]},
            "water_temperature": {"data": [{"t": "2026-04-21 12:00", "v": "24.2"}]},
        }

        def handler(request: httpx.Request) -> httpx.Response:
            product = request.url.params["product"]
            return httpx.Response(200, json=payloads[product])

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)

        with patch("httpx.Client", return_value=client):
            points = fetch_tide_latest("8726520", "St. Petersburg")

        assert len(points) == 2
        by_param = {p.parameter: p for p in points}
        assert by_param["water_level"].value == pytest.approx(0.62)
        assert by_param["water_temperature"].value == pytest.approx(24.2)
        assert all(p.source == "tide" and p.station_id == "8726520" for p in points)

    @pytest.mark.unit
    def test_skips_missing_values(self):
        payload = {"data": [{"t": "2026-04-21 12:00", "v": ""}]}

        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=payload)

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)

        with patch("httpx.Client", return_value=client):
            points = fetch_tide_latest("8726520", "St. Petersburg")

        assert points == []


class TestFetchWeather:
    @pytest.mark.unit
    def test_converts_temperature_and_wind_units(self):
        points_response = {
            "properties": {
                "forecastHourly": "https://api.weather.gov/gridpoints/TBW/71,98/forecast/hourly",
            }
        }
        forecast_response = {
            "properties": {
                "periods": [
                    {
                        "startTime": "2026-04-21T12:00:00+00:00",
                        "temperature": 77,
                        "temperatureUnit": "F",
                        "probabilityOfPrecipitation": {"value": 40},
                        "quantitativePrecipitation": {"value": 2.5},
                        "windSpeed": "5 to 10 mph",
                    }
                ]
            }
        }

        def handler(request: httpx.Request) -> httpx.Response:
            if "/points/" in str(request.url):
                return httpx.Response(200, json=points_response)
            return httpx.Response(200, json=forecast_response)

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)

        with patch("httpx.Client", return_value=client):
            points = fetch_weather_for_point(27.95, -82.46, "Tampa")

        by_param = {p.parameter: p for p in points}
        assert by_param["temperature"].value == pytest.approx(25.0, abs=0.1)  # 77F → 25C
        assert by_param["precipitation_prob"].value == 40.0
        assert by_param["precipitation_amount"].value == pytest.approx(2.5)
        assert by_param["wind_speed"].value == pytest.approx(10 * 1.609344)

    @pytest.mark.unit
    def test_handles_missing_gridpoint(self):
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json={})

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)

        with patch("httpx.Client", return_value=client):
            points = fetch_weather_for_point(27.95, -82.46, "Tampa")

        assert points == []
