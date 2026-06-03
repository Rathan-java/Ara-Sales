import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// HR-configured tiered incentive scale (on revenue surplus).
// Up to 5 slabs; each has a from/to surplus range and a percentage.
// The last slab may be open-ended (blank "to" = "and above").
const MAX_SLABS = 5;

export default function IncentiveSettings() {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Live preview inputs
  const [pvTarget, setPvTarget] = useState(100000);
  const [pvSales, setPvSales] = useState(250000);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api.get('/admin/incentive-tiers')
      .then((r) => setTiers(r.data.tiers.length ? r.data.tiers : [{ from: 0, to: 100000, percent: 5 }]))
      .catch((e) => setError(e.response?.data?.error?.message || e.message))
      .finally(() => setLoading(false));
  }, []);

  function updateRow(i, field, value) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  }

  function addSlab() {
    if (tiers.length >= MAX_SLABS) return;
    const last = tiers[tiers.length - 1];
    const from = last ? (last.to ?? Number(last.from) + 100000) : 0;
    setTiers([...tiers, { from, to: Number(from) + 100000, percent: 0 }]);
  }

  function removeSlab(i) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Normalize tiers for the API (convert blanks to null, numbers to numbers).
  function normalized() {
    return tiers.map((t) => ({
      from: Number(t.from) || 0,
      to: t.to === '' || t.to === null || t.to === undefined ? null : Number(t.to),
      percent: Number(t.percent) || 0,
    }));
  }

  async function runPreview() {
    setError('');
    try {
      const { data } = await api.post('/admin/incentive-preview', {
        revenueTarget: Number(pvTarget),
        achievedAmount: Number(pvSales),
        tiers: normalized(),
      });
      setPreview(data);
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    }
  }

  async function save() {
    setError(''); setInfo('');
    // Confirmation required before any edit is committed.
    const ok = window.confirm(
      'Confirm incentive scale change?\n\nThis updates how every rep’s incentive is calculated. '
      + 'Are you sure you want to save these slabs?',
    );
    if (!ok) return;
    try {
      const { data } = await api.put('/admin/incentive-tiers', { tiers: normalized() });
      setTiers(data.tiers);
      setInfo('Incentive scale saved.');
    } catch (e) {
      const det = e.response?.data?.error?.details;
      setError((e.response?.data?.error?.message || e.message) + (det ? `: ${det.join('; ')}` : ''));
    }
  }

  if (loading) return <div><div className="page-head"><h2>Incentive Settings</h2></div><p>Loading…</p></div>;

  return (
    <div>
      <div className="page-head"><h2>Incentive Settings</h2></div>
      <p className="muted" style={{ maxWidth: 720 }}>
        Incentive is paid only on the <strong>surplus</strong> (sales above target), split across the
        slabs below. Each slab applies its own percentage to the part of the surplus that falls in its
        range, and the results are added up. Leave the last slab&apos;s <em>To</em> blank for
        &quot;and above&quot;. Maximum {MAX_SLABS} slabs.
      </p>

      <div className="card" style={{ marginTop: 16, maxWidth: 720 }}>
        <table className="grid">
          <thead>
            <tr><th>#</th><th>From surplus (₹)</th><th>To surplus (₹)</th><th>Incentive %</th><th></th></tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><input type="number" min="0" value={t.from} onChange={(e) => updateRow(i, 'from', e.target.value)} /></td>
                <td>
                  <input
                    type="number" min="0"
                    placeholder={i === tiers.length - 1 ? 'blank = and above' : ''}
                    value={t.to ?? ''}
                    onChange={(e) => updateRow(i, 'to', e.target.value)}
                  />
                </td>
                <td><input type="number" min="0" max="100" step="0.001" value={t.percent} onChange={(e) => updateRow(i, 'percent', e.target.value)} /></td>
                <td><button className="danger" onClick={() => removeSlab(i)} disabled={tiers.length <= 1}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={addSlab} disabled={tiers.length >= MAX_SLABS}>+ Add slab</button>
          <button onClick={save}>Save scale</button>
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
        {info && <div className="hint" style={{ marginTop: 10 }}>{info}</div>}
      </div>

      <div className="card" style={{ marginTop: 20, maxWidth: 720 }}>
        <h3>Live preview</h3>
        <div className="row">
          <label style={{ margin: 0 }}>Target (₹)</label>
          <input type="number" value={pvTarget} onChange={(e) => setPvTarget(e.target.value)} />
          <label style={{ margin: 0 }}>Sales achieved (₹)</label>
          <input type="number" value={pvSales} onChange={(e) => setPvSales(e.target.value)} />
          <button onClick={runPreview}>Calculate</button>
        </div>
        {preview && (
          <div style={{ marginTop: 12 }}>
            <p>Surplus: <strong>₹{Number(preview.surplus).toLocaleString()}</strong></p>
            {preview.breakdown?.length > 0 ? (
              <table className="grid">
                <thead><tr><th>Slab range (₹)</th><th>%</th><th>Amount in slab (₹)</th><th>Incentive (₹)</th></tr></thead>
                <tbody>
                  {preview.breakdown.map((b, i) => (
                    <tr key={i}>
                      <td>{Number(b.from).toLocaleString()} – {b.to === null ? 'above' : Number(b.to).toLocaleString()}</td>
                      <td>{b.percent}%</td>
                      <td>{Number(b.amountInSlab).toLocaleString()}</td>
                      <td>{Number(b.incentive).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">No surplus — no incentive.</p>}
            <p style={{ marginTop: 8, fontSize: 18 }}>
              Total incentive: <strong style={{ color: '#1d4ed8' }}>₹{Number(preview.incentiveAmount).toLocaleString()}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
