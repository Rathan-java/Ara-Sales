import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get('/admin/products').then((r) => setProducts(r.data.products));
  };
  useEffect(load, []);

  async function add(e) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      await api.post('/admin/products', { name: name.trim() });
      setInfo(`Product "${name.trim()}" added.`);
      setName('');
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally { setBusy(false); }
  }

  async function remove(p) {
    if (!window.confirm(`Delete product "${p.name}"? Existing sales keep their product name; new sales can't use it until re-added.`)) return;
    setError(''); setInfo('');
    try {
      await api.delete(`/admin/products/${p.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    }
  }

  return (
    <div>
      <div className="page-head"><h2>Products</h2></div>
      {error && <div className="error">{error}</div>}
      {info && <div className="hint">{info}</div>}

      <div className="card" style={{ maxWidth: 560, marginBottom: 20 }}>
        <h3>Add product</h3>
        <form onSubmit={add} className="row" style={{ gap: 10 }}>
          <input
            placeholder="Product name (e.g. SchoolMate)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ minWidth: 260 }}
          />
          <button type="submit" disabled={busy || !name.trim()}>{busy ? '…' : 'Add'}</button>
        </form>
      </div>

      <table className="grid" style={{ maxWidth: 560 }}>
        <thead><tr><th>Product</th><th>Added</th><th>Actions</th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="muted">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
              <td><button className="danger" onClick={() => remove(p)}>Delete</button></td>
            </tr>
          ))}
          {products.length === 0 && <tr><td colSpan="3" className="muted">No products yet — add one above.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
