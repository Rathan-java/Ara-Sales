import React, { useEffect, useState } from 'react';
import { api, API_BASE } from '../api/client.js';

export default function Visits() {
  const [status, setStatus] = useState('');
  const [visits, setVisits] = useState([]);

  useEffect(() => {
    const params = {};
    if (status) params.status = status;
    api.get('/admin/visits', { params }).then((r) => setVisits(r.data.visits));
  }, [status]);

  return (
    <div>
      <div className="page-head"><h2>Visit Photos & Verification</h2></div>
      <div className="row filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pass">Pass</option>
          <option value="flag">Flag</option>
          <option value="reject">Reject</option>
        </select>
      </div>
      <div className="cards">
        {visits.map((v) => (
          <div className="card visit" key={v.id}>
            <div className="visit-photo">
              {v.photos?.[0]
                ? <img alt="visit" src={v.photos[0].url || `${API_BASE}/${v.photos[0].file_path}`} />
                : <div className="no-photo">No photo</div>}
              <span className={`badge ${v.status}`}>{v.status}</span>
            </div>
            <div className="visit-meta">
              <strong>{v.client_name || 'Client'}</strong>
              <div className="muted">{v.rep_name}</div>
              <div>{v.server_timestamp && new Date(v.server_timestamp).toLocaleString()}</div>
              <div>📍 {v.capture_lat}, {v.capture_lng}</div>
              <div className="flags">
                {!v.geofence_pass && <span className="flag-tag">⚠ Out of geofence</span>}
                {v.mock_location_flag && <span className="flag-tag">⚠ Mock GPS</span>}
                {v.geofence_pass && !v.mock_location_flag && v.status === 'pass'
                  && <span className="ok-tag">✓ All checks passed</span>}
              </div>
            </div>
          </div>
        ))}
        {visits.length === 0 && <p className="muted">No visits found.</p>}
      </div>
    </div>
  );
}
