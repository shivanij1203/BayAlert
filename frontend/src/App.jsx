import { useState } from "react";
import StationMap from "./components/StationMap";
import StationSelector from "./components/StationSelector";
import TrendChart from "./components/TrendChart";
import AlertBanner from "./components/AlertBanner";
import ForecastCard from "./components/ForecastCard";
import "./App.css";

// parameters we have trained forecasting models for
const FORECASTABLE = new Set(["turbidity", "specific_conductance"]);

function App() {
  const [selectedStation, setSelectedStation] = useState("02301500");
  const [selectedParameter, setSelectedParameter] = useState("specific_conductance");

  const showForecast = FORECASTABLE.has(selectedParameter);

  return (
    <div className="app">
      <header className="app-header">
        <h1>BayAlert</h1>
        <p>Tampa Bay Water Quality Monitoring</p>
      </header>

      <main className="dashboard">
        <section className="map-section">
          <StationMap
            selectedStation={selectedStation}
            onSelectStation={setSelectedStation}
          />
        </section>

        <section className="controls-section">
          <StationSelector
            selectedStation={selectedStation}
            selectedParameter={selectedParameter}
            onStationChange={setSelectedStation}
            onParameterChange={setSelectedParameter}
          />
        </section>

        <section className="charts-section">
          <TrendChart
            stationId={selectedStation}
            parameter={selectedParameter}
            hours={24}
          />
        </section>

        <section className="sidebar">
          {showForecast && (
            <ForecastCard
              stationId={selectedStation}
              parameter={selectedParameter}
            />
          )}
          <AlertBanner />
        </section>
      </main>
    </div>
  );
}

export default App;
