import { motion } from "motion/react";

const STATIONS = [
  { id: "02301500", name: "Alafia River at Lithia (upstream)" },
  { id: "02301718", name: "Alafia River at Riverview" },
  { id: "02301721", name: "Alafia River at Gibsonton (bay mouth)" },
  { id: "02306028", name: "Hillsborough River at Tampa" },
  { id: "023000095", name: "Manatee River at Rye" },
];

const ALL_PARAMETERS = [
  { code: "specific_conductance", label: "Conductance (µS/cm)" },
  { code: "turbidity", label: "Turbidity (FNU)" },
  { code: "temperature", label: "Temperature (°C)" },
  { code: "dissolved_oxygen", label: "Dissolved Oxygen (mg/L)" },
];

const STATION_PARAMETERS = {
  "02301500": ["specific_conductance", "turbidity", "temperature", "dissolved_oxygen"],
  "02301718": ["specific_conductance", "temperature"],
  "02301721": ["specific_conductance", "temperature"],
  "02306028": ["specific_conductance", "temperature"],
  "023000095": ["specific_conductance", "temperature"],
};

export default function StationSelector({
  selectedStation,
  selectedParameter,
  onStationChange,
  onParameterChange,
}) {
  const availableCodes = STATION_PARAMETERS[selectedStation] || [];
  const availableParameters = ALL_PARAMETERS.filter((p) => availableCodes.includes(p.code));

  function handleStationChange(newStationId) {
    const newAvailable = STATION_PARAMETERS[newStationId] || [];
    if (!newAvailable.includes(selectedParameter)) {
      onParameterChange(newAvailable[0]);
    }
    onStationChange(newStationId);
  }

  return (
    <motion.div
      className="card station-selector"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <div className="selector-group">
        <label htmlFor="station-select">Station</label>
        <select
          id="station-select"
          value={selectedStation}
          onChange={(e) => handleStationChange(e.target.value)}
        >
          {STATIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="selector-group">
        <label htmlFor="param-select">Parameter</label>
        <select
          id="param-select"
          value={selectedParameter}
          onChange={(e) => onParameterChange(e.target.value)}
        >
          {availableParameters.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </motion.div>
  );
}
