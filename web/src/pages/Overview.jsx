import React, { useEffect, useState } from 'react';
import { api, API_BASE } from '../api/client.js';

function MonthPicker({ month, setMonth }) {
  return (
    <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
  );
}

export default function Overview() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/overview', { params: { month } })
      .then((r) => setReps(r.data.reps))
      .finally(() => setLoading(false));
  }, [month]);

  function exportXlsx() {
    const token = localStorage.getItem('ara_token');
    // Use a direct link with auth via fetch -> blob so the file downloads.
    fetch(`${API_BASE}/api/admin/export?month=${month}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `ara-sales-${month}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div>
      <div className="page-head">
        <h2>Overview</h2>
        <div className="row">
          <MonthPicker month={month} setMonth={setMonth} />
          <button onClick={exportXlsx}>Export to Excel</button>
        </div>
      </div>

      {loading ? <p>Loading…</p> : (
       <>
        {(() => {
          const totRevenue = reps.reduce((s, r) => s + (r.achievedAmount || 0), 0);
          const totIncentive = reps.reduce((s, r) => s + (r.incentiveAmount || 0), 0);
          const achievedCount = reps.filter((r) => r.status === 'achieved').length;
          return (
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-value">{reps.length}</div><div className="stat-label">Reps</div></div>
              <div className="stat-card"><div className="stat-value">₹ {totRevenue.toLocaleString()}</div><div className="stat-label">Revenue this month</div></div>
              <div className="stat-card"><div className="stat-value">{achievedCount}/{reps.length}</div><div className="stat-label">Targets achieved</div></div>
              <div className="stat-card"><div className="stat-value">₹ {totIncentive.toLocaleString()}</div><div className="stat-label">Total incentive</div></div>
            </div>
          );
        })()}
        <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Rep</th>
              <th>Clients</th><th>Client %</th>
              <th>Revenue (₹)</th><th>Revenue %</th>
              <th>Status</th>
              <th>Client Surplus</th><th>Revenue Surplus (₹)</th>
              <th>Salary (₹)</th><th>Incentive (₹)</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.email}>
                <td>{r.name}</td>
                <td>{r.achievedClients}/{r.clientTarget}</td>
                <td>{r.clientPct}%</td>
                <td>{r.achievedAmount.toLocaleString()}/{r.revenueTarget.toLocaleString()}</td>
                <td>{r.revenuePct}%</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td>{r.clientSurplus}</td>
                <td>{r.revenueSurplus.toLocaleString()}</td>
                <td>{r.monthlySalary?.toLocaleString()}</td>
                <td><strong>{r.incentiveAmount.toLocaleString()}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
       </>
      )}
    </div>
  );
}
