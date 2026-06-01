import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const PRODUCTS = ['schoolmate', 'school_dm', 'general_dm', 'both'];
const LEADS = ['hot', 'warm', 'cold'];

export default function Sales() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [product, setProduct] = useState('');
  const [leadType, setLeadType] = useState('');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const params = { month };
    if (product) params.product = product;
    if (leadType) params.leadType = leadType;
    api.get('/admin/sales', { params }).then((r) => setRows(r.data.sales));
  }, [month, product, leadType]);

  return (
    <div>
      <div className="page-head"><h2>Sales Entries</h2></div>
      <div className="row filters">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All products</option>
          {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={leadType} onChange={(e) => setLeadType(e.target.value)}>
          <option value="">All leads</option>
          {LEADS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <table className="grid">
        <thead>
          <tr><th>Date</th><th>Rep</th><th>Client</th><th>Product</th><th>Lead</th><th>Amount (₹)</th><th>Notes</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{String(s.sale_date).slice(0, 10)}</td>
              <td>{s.rep_name}</td>
              <td>{s.client_name}</td>
              <td>{s.product}</td>
              <td><span className={`lead ${s.lead_type}`}>{s.lead_type}</span></td>
              <td>{Number(s.amount).toLocaleString()}</td>
              <td>{s.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
