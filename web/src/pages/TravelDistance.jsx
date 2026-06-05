import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Per-rep daily travel distance (KM), with a rep dropdown and month picker.
export default function TravelDistance() {
  const [reps, setReps] = useState([]);
  const [repId, setRepId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/admin/reps').then((r) => {
      setReps(r.data.reps);
      if (r.data.reps[0]) setRepId(String(r.data.reps[0].id));
    });
  }, []);

  useEffect(() => {
    if (!repId) return;
    setLoading(true);
    api.get(`/admin/distance/${repId}`, { params: { month } })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [repId, month]);

  return (
    <div>
      <div className="page-head"><h2>Travel Distance</h2></div>
      <div className="row filters">
        <label style={{ margin: 0 }}>Rep</label>
        <select value={repId} onChange={(e) => setRepId(e.target.value)}>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label style={{ margin: 0 }}>Month</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {loading ? <p>Loading…</p> : !data ? <p className="muted">No data.</p> : (
        <>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-value">{data.totalKm} km</div><div className="stat-label">Total this month</div></div>
            <div className="stat-card"><div className="stat-value">₹ {data.allowancePerKm}/km</div><div className="stat-label">Allowance rate</div></div>
            <div className="stat-card"><div className="stat-value">₹ {data.totalAllowance.toLocaleString()}</div><div className="stat-label">Total allowance</div></div>
            <div className="stat-card"><div className="stat-value">{data.days.length}</div><div className="stat-label">Active days</div></div>
          </div>

          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr><th>Date</th><th>Distance (km)</th><th>GPS points</th><th>Allowance (₹)</th></tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.km}</td>
                    <td>{d.points}</td>
                    <td>{d.allowance.toLocaleString()}</td>
                  </tr>
                ))}
                {data.days.length === 0 && <tr><td colSpan="4" className="muted">No movement recorded this month.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
