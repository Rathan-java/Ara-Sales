import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const LEADS = ['hot', 'warm', 'cold'];
const LEAD_MODES = [
  ['platform', 'Platform'],
  ['specific_dm', 'Specific Digital Marketing'],
  ['general_dm', 'General Digital Marketing'],
  ['direct_visit', 'Direct Visit'],
];
const modeLabel = (m) => (LEAD_MODES.find(([k]) => k === m)?.[1] || m || '—');

export default function Sales() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [product, setProduct] = useState('');
  const [leadMode, setLeadMode] = useState('');
  const [leadType, setLeadType] = useState('');
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);

  // Load the live product catalogue for the filter dropdown.
  useEffect(() => {
    api.get('/admin/products').then((r) => setProducts(r.data.products || []));
  }, []);

  useEffect(() => {
    const params = { month };
    if (product) params.product = product;
    if (leadMode) params.leadMode = leadMode;
    if (leadType) params.leadType = leadType;
    api.get('/admin/sales', { params }).then((r) => setRows(r.data.sales));
  }, [month, product, leadMode, leadType]);

  return (
    <div>
      <div className="page-head"><h2>Sales Entries</h2></div>
      <div className="row filters">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All products</option>
          {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
        <select value={leadMode} onChange={(e) => setLeadMode(e.target.value)}>
          <option value="">All lead modes</option>
          {LEAD_MODES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select value={leadType} onChange={(e) => setLeadType(e.target.value)}>
          <option value="">All lead types</option>
          {LEADS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr><th>Date</th><th>Rep</th><th>Client</th><th>Product</th><th>Lead mode</th><th>Lead type</th><th>Amount (₹)</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{String(s.sale_date).slice(0, 10)}</td>
                <td>{s.rep_name}</td>
                <td>{s.client_name}</td>
                <td>{s.product}</td>
                <td>{modeLabel(s.lead_mode)}</td>
                <td><span className={`lead ${s.lead_type}`}>{s.lead_type}</span></td>
                <td>{Number(s.amount).toLocaleString()}</td>
                <td>{s.notes}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="8" className="muted">No sales found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
