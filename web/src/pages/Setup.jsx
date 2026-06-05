import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Setup() {
  const [reps, setReps] = useState([]);
  const [repId, setRepId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [clientTarget, setClientTarget] = useState(10);
  const [revenueTarget, setRevenueTarget] = useState(100000);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/reps').then((r) => {
      setReps(r.data.reps);
      if (r.data.reps[0]) setRepId(String(r.data.reps[0].id));
    });
  }, []);

  async function saveTarget(e) {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      await api.post('/admin/targets', { repId, month, clientTarget, revenueTarget });
      setMsg('Target saved.');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    }
  }

  return (
    <div>
      <div className="page-head"><h2>Monthly Targets</h2></div>
      <div className="row">
        <label>Rep</label>
        <select value={repId} onChange={(e) => setRepId(e.target.value)}>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label>Month</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <form className="card" onSubmit={saveTarget} style={{ maxWidth: 520, marginTop: 16 }}>
        <h3>Monthly Target</h3>
        <label>Client-count target</label>
        <input type="number" min="0" value={clientTarget} onChange={(e) => setClientTarget(Number(e.target.value))} />
        <label>Revenue target (₹)</label>
        <input type="number" min="0" step="0.01" value={revenueTarget} onChange={(e) => setRevenueTarget(Number(e.target.value))} />
        <button type="submit" style={{ marginTop: 12 }}>Save target</button>
        <p className="muted">Either-One rule: hitting one of these marks the month achieved.</p>
        <p className="muted">Incentives are calculated from the tiered slabs in <strong>Incentive Settings</strong> (on revenue surplus), not from salary.</p>
      </form>

      {msg && <div className="hint">{msg}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
