import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';

const EMPTY = { name: '', email: '', phone: '', role: 'rep', password: '' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // user being edited, or null = create
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (roleFilter) params.role = roleFilter;
    api.get('/admin/users', { params })
      .then((r) => setUsers(r.data.users))
      .catch((e) => setErr(e.response?.data?.error?.message || e.message))
      .finally(() => setLoading(false));
  }, [q, roleFilter]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null); setForm(EMPTY); setErr(''); setMsg(''); setShowForm(true);
  }
  function openEdit(u) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, phone: u.phone || '', role: u.role, password: '' });
    setErr(''); setMsg(''); setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      if (editing) {
        const patch = { name: form.name, email: form.email, phone: form.phone, role: form.role };
        if (form.password) patch.password = form.password;
        await api.put(`/admin/users/${editing.id}`, patch);
        setMsg('User updated.');
      } else {
        await api.post('/admin/users', form);
        setMsg('User created.');
      }
      setShowForm(false);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.error?.message || e2.message);
    } finally { setBusy(false); }
  }

  async function toggleActive(u) {
    setErr(''); setMsg('');
    try {
      await api.put(`/admin/users/${u.id}`, { active: !u.active });
      load();
    } catch (e) { setErr(e.response?.data?.error?.message || e.message); }
  }

  async function removeUser(u) {
    if (!window.confirm(`Permanently DELETE ${u.name} (${u.email})?\n\nThis also removes their sales, visits and route history. This cannot be undone.\n\nTip: "Deactivate" keeps history and just blocks login.`)) return;
    setErr(''); setMsg('');
    try {
      await api.delete(`/admin/users/${u.id}`);
      setMsg('User deleted.');
      load();
    } catch (e) { setErr(e.response?.data?.error?.message || e.message); }
  }

  return (
    <div>
      <div className="page-head">
        <h2>User Management</h2>
        <button onClick={openCreate}>+ Add User</button>
      </div>

      <div className="row filters">
        <input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="admin">Admins</option>
          <option value="rep">Reps</option>
        </select>
      </div>

      {msg && <div className="hint">{msg}</div>}
      {err && <div className="error">{err}</div>}

      {loading ? <p>Loading…</p> : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'inactive-row'}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.phone || '—'}</td>
                  <td><span className={`role-tag ${u.role}`}>{u.role}</span></td>
                  <td>
                    <span className={`badge ${u.active ? 'achieved' : 'reject'}`}>
                      {u.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="mini" onClick={() => openEdit(u)}>Edit</button>
                    <button className="mini warn" onClick={() => toggleActive(u)}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="mini danger" onClick={() => removeUser(u)}>Delete</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan="6" className="muted">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? `Edit ${editing.name}` : 'Add User'}</h3>
            <form onSubmit={save}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="rep">Rep (mobile app)</option>
                <option value="admin">Admin (management)</option>
              </select>
              <label>{editing ? 'New password (leave blank to keep)' : 'Password'}</label>
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="min 8 characters" {...(editing ? {} : { required: true })} minLength={editing ? undefined : 8} />
              {err && <div className="error">{err}</div>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={busy}>{busy ? '…' : (editing ? 'Save changes' : 'Create user')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
