import React, { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api } from '../api/client.js';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];
const LEAD_COLORS = { hot: '#dc2626', warm: '#d97706', cold: '#2563eb' };
const PRODUCTS = ['schoolmate', 'school_dm', 'general_dm', 'both'];
const LEADS = ['hot', 'warm', 'cold'];

function Card({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Analytics() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reps, setReps] = useState([]);
  const [repId, setRepId] = useState('');
  const [product, setProduct] = useState('');
  const [leadType, setLeadType] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/reps').then((r) => setReps(r.data.reps)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { month };
    if (repId) params.repId = repId;
    if (product) params.product = product;
    if (leadType) params.leadType = leadType;
    api.get('/admin/analytics', { params })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [month, repId, product, leadType]);

  const productData = data
    ? Object.entries(data.byProductAmount).map(([name, value]) => ({ name, value }))
    : [];
  const leadData = data
    ? LEADS.map((k) => ({ name: k, value: data.byLeadType[k] || 0 }))
    : [];
  const repData = data?.byRep || [];
  const trend = data?.trend || [];

  return (
    <div>
      <div className="page-head"><h2>Analytics</h2></div>

      <div className="row filters">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select value={repId} onChange={(e) => setRepId(e.target.value)}>
          <option value="">All reps</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All products</option>
          {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={leadType} onChange={(e) => setLeadType(e.target.value)}>
          <option value="">All leads</option>
          {LEADS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {loading ? <p>Loading…</p> : !data ? <p className="muted">No data.</p> : (
        <>
          <div className="stat-grid">
            <Card label="Total Revenue (₹)" value={`₹ ${data.totals.revenue.toLocaleString()}`} />
            <Card label="Sales Entries" value={data.totals.salesCount} />
            <Card label="Active Reps (filtered)" value={repData.length || (repId ? 1 : reps.length)} />
            <Card label="Avg / Sale (₹)" value={data.totals.salesCount ? `₹ ${Math.round(data.totals.revenue / data.totals.salesCount).toLocaleString()}` : '—'} />
          </div>

          <div className="chart-grid">
            <div className="chart-card">
              <h3>Revenue by Product</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={productData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {productData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `₹ ${Number(v).toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>Leads by Type</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={leadData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label>
                    {leadData.map((e) => <Cell key={e.name} fill={LEAD_COLORS[e.name]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>Daily Sales Trend (₹)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} />
                  <YAxis />
                  <Tooltip formatter={(v) => `₹ ${Number(v).toLocaleString()}`} />
                  <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {!repId && (
              <div className="chart-card">
                <h3>Revenue by Rep (₹)</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={repData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v) => `₹ ${Number(v).toLocaleString()}`} />
                    <Bar dataKey="amount" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
