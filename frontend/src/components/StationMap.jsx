import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// fix default marker icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// approximate lat/lng for our USGS stations
const STATION_COORDS = {
  "02301500": { lat: 27.872, lng: -82.211, name: "Alafia River at Lithia" },
  "02301718": { lat: 27.869, lng: -82.326, name: "Alafia River at Riverview" },
  "02301721": { lat: 27.86, lng: -82.384, name: "Alafia River at Gibsonton" },
  "02306028": { lat: 27.942, lng: -82.459, name: "Hillsborough River at Tampa" },
  "023000095": { lat: 27.514, lng: -82.367, name: "Manatee River at Rye" },
};

// upstream → downstream connections for the Alafia River
const FLOW_LINES = [
  [
    [27.872, -82.211], // Lithia
    [27.869, -82.326], // Riverview
    [27.86, -82.384],  // Gibsonton
  ],
];

const TAMPA_BAY_CENTER = [27.85, -82.35];

export default function StationMap({ selectedStation, onSelectStation }) {
  return (
    <div style={{ height: "400px", width: "100%", borderRadius: "8px", overflow: "hidden" }}>
      <MapContainer
        center={TAMPA_BAY_CENTER}
        zoom={11}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* river flow direction lines */}
        {FLOW_LINES.map((line, i) => (
          <Polyline
            key={i}
            positions={line}
            color="#2196f3"
            weight={3}
            opacity={0.6}
            dashArray="10 6"
          />
        ))}

        {/* station markers */}
        {Object.entries(STATION_COORDS).map(([id, { lat, lng, name }]) => (
          <Marker
            key={id}
            position={[lat, lng]}
            eventHandlers={{
              click: () => onSelectStation && onSelectStation(id),
            }}
          >
            <Popup>
              <strong>{name}</strong>
              <br />
              Station ID: {id}
              {selectedStation === id && (
                <span style={{ color: "#2196f3" }}> (selected)</span>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
