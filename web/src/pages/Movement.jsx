import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api/client.js';
import { useMyLocation } from '../useMyLocation.js';

// Fix default marker icons (Leaflet + bundlers).
const visitIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41],
});

// A distinct coloured pin for live rep positions.
const liveIcon = new L.DivIcon({
  className: 'live-pin',
  html: '<div class="live-dot"></div>',
  iconSize: [18, 18], iconAnchor: [9, 9],
});

const LIVE_REFRESH_MS = 15000; // poll live positions every 15s
const todayStr = () => new Date().toISOString().slice(0, 10);
// 3 months back, as the min selectable date.
const threeMonthsAgoStr = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
};

export default function Movement() {
  const [mode, setMode] = useState('history'); // 'history' | 'live'
  const [reps, setReps] = useState([]);
  const [repId, setRepId] = useState('');
  const [date, setDate] = useState(todayStr());       // selected day (default today)
  const [activeDays, setActiveDays] = useState([]);   // days with data (last 90)
  const [data, setData] = useState(null);             // historical for rep+date
  const [live, setLive] = useState([]);               // live positions
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);
  const { center: myLocation } = useMyLocation(); // admin's own location as map fallback

  useEffect(() => {
    api.get('/admin/reps').then((r) => {
      setReps(r.data.reps);
      if (r.data.reps[0]) setRepId(String(r.data.reps[0].id));
    });
  }, []);

  // When the rep changes, fetch which days have movement data (for hints).
  useEffect(() => {
    if (!repId) return;
    api.get(`/admin/movement/${repId}/dates`).then((r) => setActiveDays(r.data.dates || []));
  }, [repId]);

  // Historical route for the selected rep + day.
  useEffect(() => {
    if (!repId || mode !== 'history') return;
    api.get(`/admin/movement/${repId}`, { params: { date } }).then((r) => setData(r.data));
  }, [repId, date, mode]);

  // Live polling loop.
  useEffect(() => {
    if (mode !== 'live') {
      if (timer.current) clearInterval(timer.current);
      return undefined;
    }
    const tick = () => api.get('/admin/live').then((r) => {
      setLive(r.data.live);
      setUpdatedAt(new Date());
    });
    tick();
    timer.current = setInterval(tick, LIVE_REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [mode]);

  const sessions = data?.sessions || [];
  const markers = data?.visitMarkers || [];
  const histPts = sessions.flatMap((s) => s.pings.map((p) => [Number(p.lat), Number(p.lng)]));
  const livePts = live.map((l) => [Number(l.lat), Number(l.lng)]);
  // Center on the rep's data if present, else on the admin's own current location.
  const center = (mode === 'live' ? livePts[0] : histPts[0]) || myLocation;
  const hasData = histPts.length > 0;

  return (
    <div>
      <div className="page-head">
        <h2>Field Movement</h2>
        <div className="seg">
          <button className={mode === 'history' ? 'on' : ''} onClick={() => setMode('history')}>Timeline</button>
          <button className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>Live</button>
        </div>
      </div>

      {mode === 'history' && (
        <div className="row filters">
          <label style={{ margin: 0 }}>Rep</label>
          <select value={repId} onChange={(e) => setRepId(e.target.value)}>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <label style={{ margin: 0 }}>Date</label>
          <input
            type="date"
            value={date}
            min={threeMonthsAgoStr()}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
          />
          <button onClick={() => setDate(todayStr())}>Today</button>
          <span className="muted">
            {activeDays.length
              ? `${activeDays.length} day(s) with data in the last 90`
              : 'No recorded days yet'}
          </span>
        </div>
      )}

      {mode === 'history' && !hasData && (
        <p className="muted">No travel path recorded for {reps.find((r) => String(r.id) === repId)?.name || 'this rep'} on {date}.</p>
      )}

      {mode === 'live' && (
        <p className="muted">
          {live.length
            ? `${live.length} rep(s) on an active trip · updated ${updatedAt?.toLocaleTimeString()} · auto-refresh 15s`
            : 'No reps currently on an active work trip.'}
        </p>
      )}

      <div className="map-box">
        <MapContainer center={center} zoom={13} style={{ height: '68vh', width: '100%' }} key={`${mode}-${repId}-${date}-${center[0].toFixed(3)},${center[1].toFixed(3)}`}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {mode === 'history' && (
            <>
              {sessions.map((s) => (
                <Polyline
                  key={s.session.id}
                  positions={s.pings.map((p) => [Number(p.lat), Number(p.lng)])}
                  color="#2563eb"
                />
              ))}
              {histPts.map((pt, i) => (
                <CircleMarker key={i} center={pt} radius={3} color="#93c5fd" />
              ))}
              {/* start + end markers of the day's trail */}
              {histPts.length > 0 && (
                <CircleMarker center={histPts[0]} radius={6} color="#16a34a" pathOptions={{ fillColor: '#16a34a', fillOpacity: 1 }}>
                  <Popup>Trip start</Popup>
                </CircleMarker>
              )}
              {histPts.length > 1 && (
                <CircleMarker center={histPts[histPts.length - 1]} radius={6} color="#dc2626" pathOptions={{ fillColor: '#dc2626', fillOpacity: 1 }}>
                  <Popup>Latest point</Popup>
                </CircleMarker>
              )}
              {/* named markers ONLY at client-visit points */}
              {markers.filter((m) => m.capture_lat != null).map((m) => (
                <Marker key={m.id} position={[Number(m.capture_lat), Number(m.capture_lng)]} icon={visitIcon}>
                  <Popup>
                    <strong>{m.client_name || 'Client'}</strong><br />
                    Status: {m.status}<br />
                    {m.server_timestamp && new Date(m.server_timestamp).toLocaleString()}
                  </Popup>
                </Marker>
              ))}
            </>
          )}

          {mode === 'live' && live.map((l) => (
            <Marker key={l.repId} position={[Number(l.lat), Number(l.lng)]} icon={liveIcon}>
              <Popup>
                <strong>{l.repName}</strong><br />
                Live position<br />
                {l.recordedAt && new Date(l.recordedAt).toLocaleString()}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
