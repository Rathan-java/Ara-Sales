import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Setup() {
  const [reps, setReps] = useState([]);
  const [repId, setRepId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [clientTarget, setClientTarget] = useState(10);
  const [revenueTarget, setRevenueTarget] = useState(100000);
  const [monthlySalary, setMonthlySalary] = useState(20000);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/admin/reps').then((r) => {
      setReps(r.data.reps);
      if (r.data.reps[0]) setRepId(String(r.data.reps[0].id));
    });
  }, []);

  async function saveTarget(e) {
    e.preventDefault();
    setMsg('');
    await api.post('/admin/targets', { repId, month, clientTarget, revenueTarget });
    setMsg('Target saved.');
  }

  async function saveSalary(e) {
    e.preventDefault();
    setMsg('');
    await api.post('/admin/salaries', { repId, month, monthlySalary });
    setMsg('Salary saved (admin-only).');
  }

  return (
    <div>
      <div className="page-head"><h2>Targets & Salary Setup</h2></div>
      <div className="row">
        <label>Rep</label>
        <select value={repId} onChange={(e) => setRepId(e.target.value)}>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label>Month</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="setup-grid">
        <form className="card" onSubmit={saveTarget}>
          <h3>Monthly Target</h3>
          <label>Client-count target</label>
          <input type="number" min="0" value={clientTarget} onChange={(e) => setClientTarget(Number(e.target.value))} />
          <label>Revenue target (₹)</label>
          <input type="number" min="0" step="0.01" value={revenueTarget} onChange={(e) => setRevenueTarget(Number(e.target.value))} />
          <button type="submit">Save target</button>
          <p className="muted">Either-One rule: hitting one of these marks the month achieved.</p>
        </form>

        <form className="card" onSubmit={saveSalary}>
          <h3>Monthly Salary <span className="muted">(admin-only)</span></h3>
          <label>Monthly salary (₹)</label>
          <input type="number" min="0" step="0.01" value={monthlySalary} onChange={(e) => setMonthlySalary(Number(e.target.value))} />
          <button type="submit">Save salary</button>
          <p className="muted">Never shown to reps — only the resulting incentive is.</p>
        </form>
      </div>
      {msg && <div className="hint">{msg}</div>}
    </div>
  );
}
