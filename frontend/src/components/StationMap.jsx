import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const STATION_COORDS = {
  "02301500": { lat: 27.872, lng: -82.211, name: "Alafia River at Lithia" },
  "02301718": { lat: 27.869, lng: -82.326, name: "Alafia River at Riverview" },
  "02301721": { lat: 27.86, lng: -82.384, name: "Alafia River at Gibsonton" },
  "02306028": { lat: 27.942, lng: -82.459, name: "Hillsborough River at Tampa" },
  "023000095": { lat: 27.514, lng: -82.367, name: "Manatee River at Rye" },
};

const FLOW_LINES = [
  [
    [27.872, -82.211],
    [27.869, -82.326],
    [27.86, -82.384],
  ],
];

const TAMPA_BAY_CENTER = [27.78, -82.36];

// CartoDB Positron — clean, minimal map style used by Apple Maps and most modern dashboards
const TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function StationMap({ selectedStation, onSelectStation }) {
  return (
    <div
      style={{
        height: "420px",
        width: "100%",
        borderRadius: "8px",
        overflow: "hidden",
      }}
      role="region"
      aria-label="Tampa Bay watershed map"
    >
      <MapContainer
        center={TAMPA_BAY_CENTER}
        zoom={10}
        style={{ height: "100%", width: "100%", background: "#f4f5f7" }}
        zoomControl={true}
        scrollWheelZoom={false}
      >
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          subdomains={["a", "b", "c", "d"]}
        />

        {FLOW_LINES.map((line, i) => (
          <Polyline
            key={i}
            positions={line}
            pathOptions={{
              color: "#0e7490",
              weight: 2.5,
              opacity: 0.55,
              dashArray: "6 6",
            }}
          />
        ))}

        {Object.entries(STATION_COORDS).map(([id, { lat, lng, name }]) => {
          const isActive = selectedStation === id;
          return (
            <StationMarker
              key={id}
              id={id}
              lat={lat}
              lng={lng}
              name={name}
              isActive={isActive}
              onSelect={onSelectStation}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}

function StationMarker({ id, lat, lng, name, isActive, onSelect }) {
  // active marker: larger, filled with primary, with halo
  // inactive marker: small, outlined
  return (
    <>
      {isActive && (
        <CircleMarker
          center={[lat, lng]}
          radius={16}
          pathOptions={{
            color: "#0e7490",
            fillColor: "#0e7490",
            fillOpacity: 0.15,
            weight: 0,
          }}
          interactive={false}
        />
      )}
      <CircleMarker
        center={[lat, lng]}
        radius={isActive ? 9 : 6}
        pathOptions={{
          color: "white",
          fillColor: isActive ? "#0e7490" : "#475569",
          fillOpacity: 1,
          weight: 2.5,
        }}
        eventHandlers={{
          click: () => onSelect && onSelect(id),
        }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent={isActive}>
          <span style={{ fontWeight: isActive ? 600 : 500 }}>{name}</span>
        </Tooltip>
      </CircleMarker>
    </>
  );
}
