import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import Hero from "./components/Hero";
import NavBar from "./components/NavBar";
import PageBackground from "./components/PageBackground";
import LiveProofBar from "./components/LiveProofBar";
import WhyItMatters from "./components/WhyItMatters";
import HowItWorks from "./components/HowItWorks";
import Header from "./components/Header";
import KPICards from "./components/KPICards";
import StationMap from "./components/StationMap";
import StationSelector from "./components/StationSelector";
import TrendChart from "./components/TrendChart";
import AlertBanner from "./components/AlertBanner";
import ForecastCard from "./components/ForecastCard";
import EnvironmentalCard from "./components/EnvironmentalCard";
import { useAlertWebSocket } from "./hooks/useAlertWebSocket";
import "./App.css";

const FORECASTABLE = new Set(["turbidity", "specific_conductance"]);

function App() {
  const [selectedStation, setSelectedStation] = useState("02301500");
  const [selectedParameter, setSelectedParameter] = useState("specific_conductance");
  const [lastSync, setLastSync] = useState(null);
  const { connected } = useAlertWebSocket();
  const dashboardRef = useRef(null);

  const showForecast = FORECASTABLE.has(selectedParameter);

  useEffect(() => {
    const updateSync = () => {
      setLastSync(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    updateSync();
    const interval = setInterval(updateSync, 60000);
    return () => clearInterval(interval);
  }, []);

  function scrollToDashboard() {
    dashboardRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="page" id="top">
      <PageBackground />
      <NavBar onJumpToDashboard={scrollToDashboard} connected={connected} />
      <Hero onScrollToDashboard={scrollToDashboard} />

      <LiveProofBar />

      <WhyItMatters />

      <HowItWorks />

      <section ref={dashboardRef} className="dashboard-section">
        <motion.div
          className="section-intro"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="eyebrow">Live monitoring</p>
          <h2 className="h2">Tampa Bay watershed — right now</h2>
          <p className="lede">
            Pulled directly from USGS Water Services. Updated every 15 minutes by a Celery worker.
            Anomalies and cascade alerts run through the same pipeline.
          </p>
        </motion.div>

        <div className="app">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4 }}
          >
            <Header connected={connected} lastSync={lastSync} />
          </motion.div>

          <main className="dashboard">
            <KPICards />

            <motion.section
              className="map-section"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="card map-card">
                <div className="card-header">
                  <h3>Watershed Network</h3>
                  <span className="card-subtitle">5 monitoring stations · click a marker to select</span>
                </div>
                <StationMap
                  selectedStation={selectedStation}
                  onSelectStation={setSelectedStation}
                />
              </div>
            </motion.section>

            <motion.section
              className="controls-section"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <StationSelector
                selectedStation={selectedStation}
                selectedParameter={selectedParameter}
                onStationChange={setSelectedStation}
                onParameterChange={setSelectedParameter}
              />
            </motion.section>

            <motion.section
              className="charts-section"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <TrendChart
                stationId={selectedStation}
                parameter={selectedParameter}
                hours={24}
              />
            </motion.section>

            <aside className="sidebar">
              {showForecast && (
                <ForecastCard
                  stationId={selectedStation}
                  parameter={selectedParameter}
                />
              )}
              <EnvironmentalCard />
              <AlertBanner />
            </aside>
          </main>
        </div>
      </section>

      <footer className="page-footer">
        <p>
          Built for Tampa Bay · Data from{" "}
          <a href="https://waterservices.usgs.gov/" target="_blank" rel="noreferrer">USGS Water Services</a>
          {" · "}
          <a href="https://github.com/shivanij1203/BayAlert" target="_blank" rel="noreferrer">GitHub</a>
        </p>
      </footer>
    </div>
  );
}

export default App;
