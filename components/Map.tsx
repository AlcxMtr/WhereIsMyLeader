'use client';

import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';

// Fake data for PM Carney's travels (we will replace this with real data later)
const travelData = [
  { id: 1, city: "Ottawa, ON", coords: [45.4215, -75.6972], desc: "Working from the PMO." },
  { id: 2, city: "Toronto, ON", coords: [43.6510, -79.3470], desc: "Meeting with provincial leaders regarding housing." },
  { id: 3, city: "Washington, D.C.", coords: [38.9072, -77.0369], desc: "Bilateral meeting at the White House." }
];

// Extract just the coordinates to draw the flight path
const flightPath = travelData.map(location => location.coords as [number, number]);

export default function Map() {
  return (
    <MapContainer 
      center={[43.6510, -79.3470]} // Centered around recent travel
      zoom={4} 
      style={{ height: '100vh', width: '100%' }}
    >
      {/* The base map layer */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Draw the flight trajectory */}
      <Polyline positions={flightPath} color="blue" weight={3} dashArray="5, 10" />

      {/* Place markers and popups for each location */}
      {travelData.map((loc) => (
        <Marker key={loc.id} position={loc.coords as [number, number]}>
          <Popup>
            <strong>{loc.city}</strong><br />
            {loc.desc}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}