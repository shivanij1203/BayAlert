"""
Tests for the cross-station cascade alert system.
"""

import pytest
from backend.app.services.cascade import (
    get_downstream_stations,
    get_watershed_topology,
    STATIONS,
    EDGES,
)


class TestWatershedGraph:
    def test_stations_are_defined(self):
        assert len(STATIONS) == 5
        assert "02301500" in STATIONS  # Lithia (upstream)
        assert "02301721" in STATIONS  # Gibsonton (downstream)

    def test_edges_connect_valid_stations(self):
        for edge in EDGES:
            assert edge.upstream in STATIONS, f"upstream {edge.upstream} not in STATIONS"
            assert edge.downstream in STATIONS, f"downstream {edge.downstream} not in STATIONS"

    def test_travel_times_are_positive(self):
        for edge in EDGES:
            assert edge.travel_minutes > 0

    def test_upstream_station_has_higher_river_km(self):
        for edge in EDGES:
            up = STATIONS[edge.upstream]
            down = STATIONS[edge.downstream]
            assert up.river_km > down.river_km, (
                f"{up.name} (km {up.river_km}) should be upstream of "
                f"{down.name} (km {down.river_km})"
            )


class TestDownstreamLookup:
    def test_lithia_has_two_downstream(self):
        downstream = get_downstream_stations("02301500")
        station_ids = [sid for sid, _ in downstream]
        assert "02301718" in station_ids  # Riverview
        assert "02301721" in station_ids  # Gibsonton

    def test_gibsonton_has_no_downstream(self):
        downstream = get_downstream_stations("02301721")
        assert downstream == []

    def test_cumulative_travel_time(self):
        downstream = get_downstream_stations("02301500")
        # Lithia → Riverview (180min) → Gibsonton (+120min = 300min total)
        times = {sid: mins for sid, mins in downstream}
        assert times["02301718"] == 180
        assert times["02301721"] == 300

    def test_unknown_station_returns_empty(self):
        downstream = get_downstream_stations("UNKNOWN")
        assert downstream == []


class TestWatershedTopology:
    def test_topology_has_stations_and_edges(self):
        topo = get_watershed_topology()
        assert "stations" in topo
        assert "edges" in topo
        assert len(topo["stations"]) == 5
        assert len(topo["edges"]) == len(EDGES)

    def test_topology_station_fields(self):
        topo = get_watershed_topology()
        station = topo["stations"][0]
        assert "station_id" in station
        assert "name" in station
        assert "river_km" in station

    def test_topology_edge_fields(self):
        topo = get_watershed_topology()
        edge = topo["edges"][0]
        assert "upstream" in edge
        assert "downstream" in edge
        assert "travel_minutes" in edge
        assert "upstream_name" in edge
        assert "downstream_name" in edge
