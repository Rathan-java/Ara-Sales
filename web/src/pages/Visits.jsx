import React, { useEffect, useState } from 'react';
import { api, API_BASE } from '../api/client.js';

// Build a working <img> src regardless of how the backend stored the URL.
// The backend may return an absolute URL built from PUBLIC_BASE_URL (which can
// be wrong, e.g. http://localhost:4000). We only care about the PATH
// (/api/photos/... or /uploads/...) and serve it from THIS site's own origin,
// which the host (Vercel) proxies to the real backend.
function photoSrc(photo) {
  if (!photo) return '';
  const raw = photo.url || photo.file_path || '';
  let path = raw;
  const m = raw.match(/^https?:\/\/[^/]+(\/.*)$/i);
  if (m) path = m[1];
  if (!path.startsWith('/')) path = `/${path}`;
  return `${API_BASE}${path}`;
}

const statusBadge = (s) => <span className={`badge ${s}`}>{s}</span>;

export default function Visits() {
  const [status, setStatus] = useState('');
  const [visits, setVisits] = useState([]);
  const [viewing, setViewing] = useState(null);     // visit being viewed in the popup
  const [selected, setSelected] = useState(new Set()); // selected visit_photo ids
  const [busy, setBusy] = useState(false);

  function load() {
    const params = {};
    if (status) params.status = status;
    api.get('/admin/visits', { params }).then((r) => {
      setVisits(r.data.visits);
      setSelected(new Set());
    });
  }
  useEffect(load, [status]);

  // Close popup on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setViewing(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // All photo ids currently shown (only visits that HAVE a photo).
  const allPhotoIds = visits.filter((v) => v.photos?.[0]).map((v) => v.photos[0].id);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === allPhotoIds.length ? new Set() : new Set(allPhotoIds)));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected image(s) from the database? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.post('/admin/visit-photos/delete', { ids: [...selected] });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Visit Photos & Verification</h2>
        {selected.size > 0 && (
          <button className="danger" disabled={busy} onClick={deleteSelected}>
            {busy ? 'Deleting…' : `Delete selected (${selected.size})`}
          </button>
        )}
      </div>
      <div className="row filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pass">Pass</option>
          <option value="flag">Flag</option>
          <option value="reject">Reject</option>
        </select>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allPhotoIds.length > 0 && selected.size === allPhotoIds.length}
                  onChange={toggleAll}
                  title="Select all images"
                />
              </th>
              <th>Date &amp; Time</th>
              <th>Rep</th>
              <th>Client</th>
              <th>Status</th>
              <th>Coordinates</th>
              <th>Checks</th>
              <th>Image</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => {
              const photo = v.photos?.[0];
              return (
                <tr key={v.id}>
                  <td>
                    {photo
                      ? <input type="checkbox" checked={selected.has(photo.id)} onChange={() => toggle(photo.id)} />
                      : null}
                  </td>
                  <td>{v.server_timestamp ? new Date(v.server_timestamp).toLocaleString() : '—'}</td>
                  <td>{v.rep_name}</td>
                  <td>{v.client_name || 'Client'}</td>
                  <td>{statusBadge(v.status)}</td>
                  <td>{v.capture_lat != null ? `${v.capture_lat}, ${v.capture_lng}` : '—'}</td>
                  <td>
                    {!v.geofence_pass && <span className="flag-tag">⚠ Out of geofence</span>}
                    {v.geofence_pass && v.status === 'pass' && <span className="ok-tag">✓ Passed</span>}
                  </td>
                  <td>
                    {photo
                      ? <button className="linklike" onClick={() => setViewing(v)}>View image</button>
                      : <span className="muted">No photo</span>}
                  </td>
                </tr>
              );
            })}
            {visits.length === 0 && (
              <tr><td colSpan="8" className="muted">No visits found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Image popup */}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setViewing(null)} aria-label="Close">✕</button>
            <div className="modal-title">
              <strong>{viewing.client_name || 'Client'}</strong>
              <span className="muted"> — {viewing.rep_name}</span>
            </div>
            <img className="modal-img" alt="visit" src={photoSrc(viewing.photos[0])} />
            <div className="modal-meta">
              <div>🕒 {viewing.server_timestamp ? new Date(viewing.server_timestamp).toLocaleString() : '—'}</div>
              <div>📍 {viewing.capture_lat}, {viewing.capture_lng}
                {viewing.capture_lat != null && (
                  <a
                    href={`https://www.google.com/maps?q=${viewing.capture_lat},${viewing.capture_lng}`}
                    target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}
                  >open in Maps</a>
                )}
              </div>
              <div>Status: {statusBadge(viewing.status)}
                {!viewing.geofence_pass && <span className="flag-tag" style={{ marginLeft: 8 }}>⚠ Out of geofence</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
