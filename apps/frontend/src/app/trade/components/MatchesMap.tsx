'use client';

import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { City, TradeMatch } from '@/lib/api';

const requesterIcon = L.divIcon({
  className: 'cromo-map-pin cromo-map-pin--me',
  html: '<div class="cromo-map-pin-dot cromo-map-pin-dot--me" aria-hidden></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const matchIcon = L.divIcon({
  className: 'cromo-map-pin cromo-map-pin--match',
  html: '<div class="cromo-map-pin-dot cromo-map-pin-dot--match" aria-hidden></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface Props {
  myCities: City[];
  radiusKm: number;
  matches: TradeMatch[];
  onSelectMatch?: (userId: string) => void;
  selectedUserId?: string | null;
}

interface PinPoint {
  key: string;
  lat: number;
  lng: number;
  label: string;
  match?: TradeMatch;
}

function hasCoords(c: City): c is City & { lat: number; lng: number } {
  return typeof c.lat === 'number' && typeof c.lng === 'number';
}

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 10);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  }, [map, points]);
  return null;
}

export default function MatchesMap({
  myCities,
  radiusKm,
  matches,
  onSelectMatch,
  selectedUserId,
}: Props) {
  const origins = useMemo<PinPoint[]>(
    () =>
      myCities.filter(hasCoords).map((c) => ({
        key: `me-${c.placeId}`,
        lat: c.lat,
        lng: c.lng,
        label: c.label,
      })),
    [myCities],
  );

  // One pin per (match, geocoded city). Same user with multiple cities shows
  // up as several dots — that's intentional: clicking any of them highlights
  // the same match card, and skipping non-geocoded cities keeps the map honest
  // about which candidates we can actually place on it.
  const matchPins = useMemo<PinPoint[]>(() => {
    const out: PinPoint[] = [];
    for (const m of matches) {
      for (const c of m.cities) {
        if (!hasCoords(c)) continue;
        out.push({
          key: `${m.userId}-${c.placeId}`,
          lat: c.lat,
          lng: c.lng,
          label: `${m.displayName ?? m.username} · ${c.label}`,
          match: m,
        });
      }
    }
    return out;
  }, [matches]);

  const allPoints = useMemo(
    () => [...origins, ...matchPins].map((p) => ({ lat: p.lat, lng: p.lng })),
    [origins, matchPins],
  );

  if (origins.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] p-6 text-center text-sm text-[var(--cromo-fg-muted)]">
        Add a city above to see matches on a map.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--cromo-border)] h-72 sm:h-80 relative">
      <MapContainer
        center={[origins[0]!.lat, origins[0]!.lng]}
        zoom={9}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={allPoints} />
        {origins.map((p) => (
          <Circle
            key={`r-${p.key}`}
            center={[p.lat, p.lng]}
            radius={radiusKm * 1000}
            pathOptions={{
              // Hardcoded brand teal — Leaflet writes the stroke/fill onto the
              // SVG element directly and SVG attributes don't resolve CSS vars
              // reliably across browsers. Keep this in sync with --cromo-accent.
              color: '#0E7490',
              fillColor: '#0E7490',
              fillOpacity: 0.06,
              weight: 1,
            }}
          />
        ))}
        {origins.map((p) => (
          <Marker key={p.key} position={[p.lat, p.lng]} icon={requesterIcon}>
            <Tooltip direction="top" offset={[0, -8]}>{p.label}</Tooltip>
          </Marker>
        ))}
        {matchPins.map((p) => (
          <Marker
            key={p.key}
            position={[p.lat, p.lng]}
            icon={matchIcon}
            eventHandlers={
              onSelectMatch && p.match
                ? { click: () => onSelectMatch(p.match!.userId) }
                : undefined
            }
            opacity={selectedUserId && p.match?.userId === selectedUserId ? 1 : 0.85}
          >
            <Tooltip direction="top" offset={[0, -6]}>{p.label}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
