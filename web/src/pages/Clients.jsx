import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api/client.js';
import { useMyLocation } from '../useMyLocation.js';

const icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41],
});

// Lightweight parser so the map can preview a pasted Google link/coords before saving.
function parseCoords(text) {
  if (!text) return null;
  let m = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2] };
  m = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2] };
  m = text.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2] };
  // "Latitude: <lat> Longitude: <lng>" copy format
  m = text.match(/lat(?:itude)?\s*[:=]?\s*(-?\d+(?:\.\d+)?)[\s,;]+long?(?:itude)?\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  if (m) return { lat: +m[1], lng: +m[2] };
  // plain "lat, lng"
  m = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (m) return { lat: +m[1], lng: +m[2] };
  // two bare numbers anywhere (last resort)
  m = text.match(/(-?\d{1,2}\.\d+)[\s,]+(-?\d{1,3}\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2] };
  return null;
}

function ClickToPin({ onPick }) {
  useMapEvents({ click(e) { onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [defaultRadius, setDefaultRadius] = useState(150);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState(null); // client object being location-edited
  const { center: myLocation } = useMyLocation(); // admin's location, for the map default

  // New client form
  const [nName, setNName] = useState('');
  const [nPhone, setNPhone] = useState('');
  const [nAddr, setNAddr] = useState('');
  const [nGoogle, setNGoogle] = useState('');

  // Location editor
  const [locText, setLocText] = useState('');
  const [locRadius, setLocRadius] = useState(150);

  const load = () => {
    setLoading(true);
    api.get('/admin/clients')
      .then((r) => { setClients(r.data.clients); setDefaultRadius(r.data.defaultRadiusM || 150); })
      .catch((e) => setError(e.response?.data?.error?.message || e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const previewPin = useMemo(() => parseCoords(locText), [locText]);

  async function addClient(e) {
    e.preventDefault(); setError(''); setInfo('');
    try {
      await api.post('/admin/clients', {
        name: nName, phone: nPhone || undefined, address: nAddr || undefined,
        googleLocation: nGoogle || undefined,
      });
      setNName(''); setNPhone(''); setNAddr(''); setNGoogle('');
      setInfo('Client added.'); load();
    } catch (e2) { setError(e2.response?.data?.error?.message || e2.message); }
  }

  function openLocation(c) {
    setEditing(c);
    setLocText('');
    setLocRadius(c.geofence_radius_m || defaultRadius);
  }

  async function saveLocation() {
    setError(''); setInfo('');
    if (!window.confirm('Set this as the client’s permanent location? Only HR can change it afterward.')) return;
    try {
      await api.put(`/admin/clients/${editing.id}/location`, { googleLocation: locText });
      if (Number(locRadius) !== Number(editing.geofence_radius_m)) {
        await api.put(`/admin/clients/${editing.id}`, { geofenceRadiusM: Number(locRadius) });
      }
      setInfo('Location saved.'); setEditing(null); load();
    } catch (e) { setError(e.response?.data?.error?.message || e.message); }
  }

  async function approve(c) {
    if (!window.confirm(`Approve the rep-captured location for ${c.name} as permanent?`)) return;
    try { await api.post(`/admin/clients/${c.id}/location/approve`); load(); }
    catch (e) { setError(e.response?.data?.error?.message || e.message); }
  }
  async function reject(c) {
    if (!window.confirm(`Reject the captured location for ${c.name}?`)) return;
    try { await api.post(`/admin/clients/${c.id}/location/reject`); load(); }
    catch (e) { setError(e.response?.data?.error?.message || e.message); }
  }
  async function removeClient(c) {
    if (!window.confirm(`Delete ${c.name}? This also removes its visits/sales links.`)) return;
    try { await api.delete(`/admin/clients/${c.id}`); load(); }
    catch (e) { setError(e.response?.data?.error?.message || e.message); }
  }

  const badge = (s) => {
    const map = { approved: 'achieved', pending: 'flag', unset: 'pending' };
    const label = { approved: 'Location set', pending: 'Awaiting approval', unset: 'No location' };
    return <span className={`badge ${map[s] || 'pending'}`}>{label[s] || s}</span>;
  };

  if (loading) return <div><div className="page-head"><h2>Clients</h2></div><p>Loading…</p></div>;

  return (
    <div>
      <div className="page-head"><h2>Clients</h2></div>
      {error && <div className="error">{error}</div>}
      {info && <div className="hint">{info}</div>}

      {/* Add client */}
      <div className="card" style={{ maxWidth: 900, marginBottom: 20 }}>
        <h3>Add client</h3>
        <form onSubmit={addClient} className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <input placeholder="Client name *" value={nName} onChange={(e) => setNName(e.target.value)} required />
          <input placeholder="Phone" value={nPhone} onChange={(e) => setNPhone(e.target.value)} />
          <input placeholder="Address" value={nAddr} onChange={(e) => setNAddr(e.target.value)} style={{ minWidth: 220 }} />
          <input placeholder="Google Maps link or lat,lng (optional)" value={nGoogle} onChange={(e) => setNGoogle(e.target.value)} style={{ minWidth: 280 }} />
          <button type="submit">Add</button>
        </form>
        <p className="muted" style={{ marginTop: 6 }}>
          Tip: in Google Maps, right-click the spot → click the coordinates to copy, or use the address-bar URL.
        </p>
      </div>

      {/* Clients table */}
      <table className="grid">
        <thead>
          <tr><th>Name</th><th>Phone</th><th>Address</th><th>Location</th><th>Coordinates</th><th>Radius</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone || '—'}</td>
              <td>{c.address || '—'}</td>
              <td>{badge(c.location_status)}</td>
              <td>{c.reference_lat ? `${c.reference_lat}, ${c.reference_lng}` : (c.pending_lat ? `(pending) ${c.pending_lat}, ${c.pending_lng}` : '—')}</td>
              <td>{c.geofence_radius_m || defaultRadius} m</td>
              <td>
                <div className="row" style={{ gap: 6 }}>
                  <button onClick={() => openLocation(c)}>Set location</button>
                  {c.location_status === 'pending' && (
                    <>
                      <button onClick={() => approve(c)}>Approve</button>
                      <button className="danger" onClick={() => reject(c)}>Reject</button>
                    </>
                  )}
                  <button className="danger" onClick={() => removeClient(c)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {clients.length === 0 && <tr><td colSpan="7" className="muted">No clients yet.</td></tr>}
        </tbody>
      </table>

      {/* Pending photo review hint */}
      {clients.some((c) => c.location_status === 'pending' && c.pending_photo_url) && (
        <div className="card" style={{ marginTop: 20, maxWidth: 900 }}>
          <h3>Locations awaiting approval (rep-captured)</h3>
          <div className="cards">
            {clients.filter((c) => c.location_status === 'pending').map((c) => (
              <div className="card visit" key={c.id}>
                <div className="visit-photo">
                  {c.pending_photo_url ? <img alt="capture" src={c.pending_photo_url} /> : <div className="no-photo">No photo</div>}
                </div>
                <div className="visit-meta">
                  <strong>{c.name}</strong>
                  <div>📍 {c.pending_lat}, {c.pending_lng}</div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button onClick={() => approve(c)}>Approve</button>
                    <button className="danger" onClick={() => reject(c)}>Reject</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Location editor modal-ish card */}
      {editing && (
        <div className="card" style={{ marginTop: 20, maxWidth: 900 }}>
          <div className="page-head"><h3>Set location — {editing.name}</h3>
            <button className="danger" onClick={() => setEditing(null)}>Close</button>
          </div>
          <label>Paste Google Maps link or coordinates (lat, lng)</label>
          <input value={locText} onChange={(e) => setLocText(e.target.value)} placeholder="https://maps.google.com/... or 12.9716, 77.5946" style={{ width: '100%' }} />
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ margin: 0 }}>Geofence radius (m)</label>
            <input type="number" min="10" max="5000" value={locRadius} onChange={(e) => setLocRadius(e.target.value)} />
            <button onClick={saveLocation} disabled={!previewPin}>Save permanent location</button>
          </div>
          {!previewPin && locText && <div className="muted" style={{ marginTop: 6 }}>Couldn’t read coordinates yet — paste a full URL or “lat, lng”. (Short goo.gl links are resolved on save.)</div>}
          <div className="map-box" style={{ marginTop: 12 }}>
            <MapContainer center={previewPin ? [previewPin.lat, previewPin.lng] : myLocation} zoom={previewPin ? 16 : 12} style={{ height: '50vh', width: '100%' }} key={previewPin ? `${previewPin.lat},${previewPin.lng}` : `me-${myLocation[0].toFixed(3)},${myLocation[1].toFixed(3)}`}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <ClickToPin onPick={(p) => setLocText(`${p.lat.toFixed(7)}, ${p.lng.toFixed(7)}`)} />
              {previewPin && <Marker position={[previewPin.lat, previewPin.lng]} icon={icon} />}
              {previewPin && <Circle center={[previewPin.lat, previewPin.lng]} radius={Number(locRadius) || 150} />}
            </MapContainer>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>You can also click directly on the map to drop the pin.</p>
        </div>
      )}
    </div>
  );
}
