'use client';

import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L, { LatLngExpression, Icon, PathOptions } from 'leaflet';
import 'leaflet-arrowheads';

interface TravelPoint {
  id: number;
  city: string;
  coords: [number, number];
  desc: string;
  arrival: string;
  departure: string;
}

type FlightPath = [number, number][];

interface FlightSegment {
  path: FlightPath;
  arrival: string;
  isFuture: boolean;
  label: string;
}

function formatDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function shortestPath(from: [number, number], to: [number, number]): FlightPath {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  let adjustedLon2 = lon2;
  const dLon = lon2 - lon1;
  if (dLon > 180)  adjustedLon2 = lon2 - 360;
  if (dLon < -180) adjustedLon2 = lon2 + 360;
  return [[lat1, lon1], [lat2, adjustedLon2]];
}

const WORLD_OFFSETS = [-720, -360, 0, 360, 720];

function multiplyPathHorizontally(path: FlightPath): FlightPath[] {
  return WORLD_OFFSETS.map(delta =>
    path.map(([lat, lon]) => [lat, lon + delta] as [number, number])
  );
}

function shiftGeoJSON(geojson: GeoJSON.GeoJSON, deltaLon: number): GeoJSON.GeoJSON {
  const json = JSON.parse(JSON.stringify(geojson)) as GeoJSON.GeoJSON;
  function shiftCoord(c: number[]) { c[0] = c[0] + deltaLon; }
  function shiftRing(ring: number[][]) { ring.forEach(shiftCoord); }
  function shiftGeometry(g: GeoJSON.Geometry) {
    if (g.type === 'Polygon') g.coordinates.forEach(shiftRing);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly => poly.forEach(shiftRing));
  }
  if (json.type === 'FeatureCollection') (json as GeoJSON.FeatureCollection).features.forEach(f => { if (f.geometry) shiftGeometry(f.geometry); });
  else if (json.type === 'Feature') { const f = json as GeoJSON.Feature; if (f.geometry) shiftGeometry(f.geometry); }
  else shiftGeometry(json as GeoJSON.Geometry);
  return json;
}

const countryNameToCode: Record<string, string> = {
  Canada: 'ca', China: 'cn', Qatar: 'qa', Switzerland: 'ch',
  India: 'in', Australia: 'au', Japan: 'jp', Norway: 'no', 'United Kingdom': 'gb'
};

const geojsonFileOverride: Record<string, string> = { gb: 'gb' };
function getGeojsonFilename(code: string): string {
  return geojsonFileOverride[code.toLowerCase()] ?? code.toLowerCase();
}

function getCountryInfo(city: string): { name: string | null; code: string | null } {
  const parts = city.split(',');
  const rawCountry = parts[parts.length - 1]?.trim() ?? '';
  const code = countryNameToCode[rawCountry] ?? null;
  return { name: rawCountry || null, code };
}

const redPinIcon: Icon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconSize: [20, 32], iconAnchor: [10, 32], popupAnchor: [1, -28],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [32, 32], shadowAnchor: [10, 32],
});

const greenPinIcon: Icon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  iconSize: [20, 32], iconAnchor: [10, 32], popupAnchor: [1, -28],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [32, 32], shadowAnchor: [10, 32],
});

const planeIcon: Icon = L.divIcon({
  html: '✈️',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  className: '',
}) as unknown as Icon;

function CountryFlagPolygons({ countryCodes }: { countryCodes: string[] }) {
  const map = useMap();
  useEffect(() => {
    if (!countryCodes.length) return;
    const layerGroup = L.layerGroup().addTo(map);
    const palette = ['#fecaca', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#a5f3fc'];
    countryCodes.forEach((code, idx) => {
      const filename = getGeojsonFilename(code);
      fetch(`/geojson/${filename}.json`)
        .then(r => (r.ok ? r.json() : null))
        .then((geojson: GeoJSON.GeoJSON | null) => {
          if (!geojson) return;
          const fillColor = palette[idx % palette.length];
          const style: PathOptions = { color: '#ffffff', weight: 1, fillColor, fillOpacity: 0.4, pane: 'tilePane' };
          WORLD_OFFSETS.forEach(deltaLon => {
            const shifted = deltaLon === 0 ? geojson : shiftGeoJSON(geojson, deltaLon);
            L.geoJSON(shifted, { style: () => style }).addTo(layerGroup);
          });
        }).catch(() => {});
    });
    return () => { map.removeLayer(layerGroup); };
  }, [countryCodes, map]);
  return null;
}

function MapUpdater({ segments }: { segments: FlightSegment[] }) {
  const map = useMap();
  const lerpColor = (t: number): string => {
    const stops: [number, number, number][] = [
      [220, 38, 38], [249, 115, 0], [250, 204, 21], [22, 163, 74],
    ];
    const scaled = t * (stops.length - 1);
    const lo = Math.floor(scaled);
    const hi = Math.min(lo + 1, stops.length - 1);
    const frac = scaled - lo;
    const [r1, g1, b1] = stops[lo];
    const [r2, g2, b2] = stops[hi];
    return `rgb(${Math.round(r1 + (r2 - r1) * frac)}, ${Math.round(g1 + (g2 - g1) * frac)}, ${Math.round(b1 + (b2 - b1) * frac)})`;
  };
  useEffect(() => {
    map.eachLayer(layer => { if (layer instanceof L.Polyline) map.removeLayer(layer); });
    const pastSegments = segments.filter(s => !s.isFuture);
    const futureSegments = segments.filter(s => s.isFuture);
    const pastCount = pastSegments.length;
    pastSegments.forEach((seg, index) => {
      const t = pastCount <= 1 ? 1 : index / (pastCount - 1);
      const color = lerpColor(t);
      multiplyPathHorizontally(seg.path).forEach(p => {
        const polyline = L.polyline(p as LatLngExpression[], { color, weight: 3, opacity: 1, dashArray: '5 5', pane: 'overlayPane' }).addTo(map);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (polyline as any).arrowheads({ size: '10px', frequency: 'endonly', yawn: 40 });
      });
    });
    futureSegments.forEach(seg => {
      multiplyPathHorizontally(seg.path).forEach(p => {
        const polyline = L.polyline(p as LatLngExpression[], { color: '#1d4ed8', weight: 3, opacity: 1, dashArray: '5 5', pane: 'overlayPane' }).addTo(map);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (polyline as any).arrowheads({ size: '10px', frequency: 'endonly', yawn: 40 });
      });
    });
  }, [segments, map]);
  return null;
}

// Stores marker refs so we can open popups programmatically
const markerRegistry = new globalThis.Map<number, L.Marker>();

function AllMarkers({ travelData }: { travelData: TravelPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!travelData.length) return;
    markerRegistry.clear();
    const layerGroup = L.layerGroup().addTo(map);
    travelData.forEach((loc, index) => {
      const isLatest = index === travelData.length - 1;
      const icon = isLatest ? greenPinIcon : redPinIcon;
      const arrivalLabel = formatDateLabel(loc.arrival);
      const departureLabel = formatDateLabel(loc.departure);
      const rangeLabel = arrivalLabel && departureLabel ? `${arrivalLabel} → ${departureLabel}` : arrivalLabel || departureLabel;
      const { name: countryName, code: countryCode } = getCountryInfo(loc.city);
      const flagUrl = countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : null;
      const flagImg = flagUrl
        ? `<img src="${flagUrl}" alt="${countryName ?? ''}" style="width:24px;height:16px;border-radius:2px;box-shadow:0 0 4px rgba(0,0,0,0.25);margin-right:8px;vertical-align:middle" />`
        : '';
      const popupHTML = `
        <div style="min-width:220px">
          <div style="display:flex;align-items:center;margin-bottom:6px">
            ${flagImg}
            <div>
              <div style="font-weight:600">${loc.city}</div>
              ${rangeLabel ? `<div style="font-size:12px;color:#64748b">${rangeLabel}</div>` : ''}
            </div>
          </div>
          <div style="font-size:13px;color:#0f172a;line-height:1.5">${loc.desc}</div>
        </div>`;
      const [lat, lon] = loc.coords;
      WORLD_OFFSETS.forEach((delta, di) => {
        const marker = L.marker([lat, lon + delta] as LatLngExpression, { icon })
          .bindPopup(popupHTML, { minWidth: 220 })
          .addTo(layerGroup);
        // Only register the center-world copy (delta === 0) for popup opening
        if (di === 2) markerRegistry.set(loc.id, marker);
      });
    });
    return () => { map.removeLayer(layerGroup); markerRegistry.clear(); };
  }, [travelData, map]);
  return null;
}

// Handles the fly animation: zoom out → pan → zoom in → open popup
function FlyController({ target, travelData }: { target: TravelPoint | null; travelData: TravelPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;

    const targetIndex = travelData.findIndex(p => p.id === target.id);
    const prev = targetIndex > 0 ? travelData[targetIndex - 1] : null;
    const [lat, lon] = target.coords;

    // Build plane icon pointing in a given direction (degrees)
    function makePlaneIcon(bearing: number) {
      return L.divIcon({
        className: '',
        html: `<div style="transform:rotate(${bearing}deg);font-size:22px;line-height:1;">✈️</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
    }

    // Calculate bearing between two points (degrees)
    function getBearing(from: [number, number], to: [number, number]): number {
      const dLon = ((to[1] - from[1]) * Math.PI) / 180;
      const lat1 = (from[0] * Math.PI) / 180;
      const lat2 = (to[0] * Math.PI) / 180;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    }

    let planeMarker: L.Marker | null = null;
    let animFrame: number | null = null;

    // Step 1: fly to previous location zoomed in
    if (prev) {
      map.flyTo(prev.coords, 5, { duration: 1.2 });
    }

    // Step 2: zoom out proportional to distance
    const t1 = window.setTimeout(() => {
      const center = prev ? prev.coords : map.getCenter();
      let midZoom = 4.5;
      if (prev) {
        const dLat = target.coords[0] - prev.coords[0];
        const dLon = target.coords[1] - prev.coords[1];
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);
        midZoom = Math.max(3.9, 4.5 - (dist / 180) * 1.05);
      }
      map.flyTo(center, midZoom, { duration: 0.8 });
    }, prev ? 1400 : 0);

    // Step 3: pan to destination + animate plane
    const t2 = window.setTimeout(() => {
      const fromCoords: [number, number] = prev ? prev.coords : [lat, lon];
      const toCoords: [number, number] = [lat, lon];
      const bearing = getBearing(fromCoords, toCoords);

      // Place plane at origin
      planeMarker = L.marker(fromCoords, {
        icon: makePlaneIcon(bearing),
        zIndexOffset: 9999,
        interactive: false,
      }).addTo(map);

      // Animate plane over 1500ms
      const panDuration = 1500;
      const startTime = performance.now();

      function animatePlane(now: number) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / panDuration, 1);
        const curLat = fromCoords[0] + (toCoords[0] - fromCoords[0]) * t;
        const curLon = fromCoords[1] + (toCoords[1] - fromCoords[1]) * t;
        planeMarker?.setLatLng([curLat, curLon]);
        if (t < 1) {
          animFrame = requestAnimationFrame(animatePlane);
        }
      }

      animFrame = requestAnimationFrame(animatePlane);
      map.flyTo(toCoords, 3, { duration: 1.5 });
    }, prev ? 2300 : 100);

    // Step 4: zoom in, remove plane
    const t3 = window.setTimeout(() => {
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      if (planeMarker) { map.removeLayer(planeMarker); planeMarker = null; }
      map.flyTo([lat, lon], 5, { duration: 1 });
    }, prev ? 4000 : 1700);

    // Step 5: open popup
    const t4 = window.setTimeout(() => {
      const marker = markerRegistry.get(target.id);
      if (marker) marker.openPopup();
    }, prev ? 5100 : 2800);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      if (planeMarker) { map.removeLayer(planeMarker); }
    };
  }, [target, map, travelData]);

  return null;
}


// --- Sidebar ---------------------------------------------------------

function Sidebar({ travelData, onSelect }: { travelData: TravelPoint[]; onSelect: (loc: TravelPoint) => void }) {
  const sorted = [...travelData].reverse();
  const [activeId, setActiveId] = useState<number | null>(null);

  return (
    <div style={{
      width: '280px', minWidth: '280px', height: '100vh', overflowY: 'auto',
      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
      borderRight: '1px solid #e2e8f0', zIndex: 1000,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>Mark Carney</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Travel Log</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.map((loc, i) => {
          const { code } = getCountryInfo(loc.city);
          const flagUrl = code ? `https://flagcdn.com/w40/${code}.png` : null;
          const isLatest = i === 0;
          const isActive = loc.id === activeId;
          const arrivalLabel = formatDateLabel(loc.arrival);
          const departureLabel = formatDateLabel(loc.departure);
          const rangeLabel = arrivalLabel && departureLabel
            ? `${arrivalLabel} – ${departureLabel}`
            : arrivalLabel || departureLabel;

          return (
            <div
              key={loc.id}
              onClick={() => { setActiveId(loc.id); onSelect(loc); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px', borderBottom: '1px solid #f1f5f9',
                background: isActive ? '#eff6ff' : isLatest ? '#f0fdf4' : 'transparent',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isActive ? '#eff6ff' : isLatest ? '#f0fdf4' : 'transparent'; }}
            >
              {flagUrl ? (
                <img src={flagUrl} alt="" style={{ width: '28px', height: '19px', borderRadius: '3px', boxShadow: '0 0 3px rgba(0,0,0,0.2)', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '28px', height: '19px', background: '#e2e8f0', borderRadius: '3px', flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {loc.city.split(',')[0]}
                  {isLatest && (
                    <span style={{ marginLeft: '6px', fontSize: '10px', background: '#22c55e', color: '#fff', borderRadius: '4px', padding: '1px 5px', verticalAlign: 'middle' }}>
                      NOW
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{rangeLabel}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- main ------------------------------------------------------------

export default function Map() {
  const [travelData, setTravelData] = useState<TravelPoint[]>([]);
  const [segments,   setSegments  ] = useState<FlightSegment[]>([]);
  const [flyTarget,  setFlyTarget ] = useState<TravelPoint | null>(null);

  useEffect(() => {
    // 1. UPDATED ENDPOINT: Changed from '/api/trips.json' to '/api/trips'
    fetch('/api/trips')
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch trips from database');
        return r.json();
      })
      .then((data: TravelPoint[]) => {
        setTravelData(data);
        const now = new Date();
        const segs: FlightSegment[] = data
          .map((loc, i) => {
            if (i === 0) return null;
            const prev = data[i - 1];
            const path = shortestPath(prev.coords, loc.coords);
            const arrivalDate = new Date(loc.arrival);
            const isFuture = arrivalDate > now;
            const label = formatDateLabel(loc.arrival);
            return { path, arrival: loc.arrival, isFuture, label };
          })
          .filter((s): s is FlightSegment => s !== null);
        setSegments(segs);
      })
      // 2. ADDED ERROR HANDLING: Just in case the SQLite DB is locked or booting
      .catch(err => console.error("Error loading map data:", err));
  }, []);

  if (!travelData.length) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-300">
        Loading Mark Carney&apos;s travel map…
      </div>
    );
  }

  const visitedCountryCodes = Array.from(
    new Set(travelData.map(tp => getCountryInfo(tp.city).code).filter((c): c is string => Boolean(c)))
  );

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <Sidebar travelData={travelData} onSelect={loc => setFlyTarget({ ...loc })} />

      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={travelData[travelData.length - 1]?.coords || [45.4215, -75.6972]}
          zoom={3}
          style={{ height: '100%', width: '100%' }}
          className="rounded-xl overflow-hidden shadow-xl"
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          />
          <CountryFlagPolygons countryCodes={visitedCountryCodes} />
          <MapUpdater segments={segments} />
          <AllMarkers travelData={travelData} />
          <FlyController target={flyTarget} travelData={travelData} />
        </MapContainer>
      </div>
    </div>
  );
}
