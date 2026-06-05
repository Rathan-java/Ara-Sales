import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Set the travel-allowance rate per kilometre (₹/km). Applied to each rep's
// daily distance on the Travel Distance page and in the Excel export.
export default function Allowance() {
  const [rate, setRate] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/allowance').then((r) => setRate(r.data.allowancePerKm)).catch(() => {});
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg(''); setError(''); setSaving(true);
    try {
      await api.put('/admin/allowance', { allowancePerKm: Number(rate) });
      setMsg('Allowance rate saved.');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head"><h2>Travel Allowance</h2></div>
      <form className="card" onSubmit={save} style={{ maxWidth: 480 }}>
        <h3>Allowance per kilometre</h3>
        <label>Rate (₹ per km)</label>
        <input
          type="number" min="0" step="0.01" value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        <button type="submit" disabled={saving} style={{ marginTop: 12 }}>
          {saving ? 'Saving…' : 'Save rate'}
        </button>
        <p className="muted">
          Each rep&apos;s travel allowance = (km travelled) × (this rate). See the
          <strong> Travel Distance</strong> page and the Excel export for per-day amounts.
        </p>
        {msg && <div className="hint">{msg}</div>}
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
