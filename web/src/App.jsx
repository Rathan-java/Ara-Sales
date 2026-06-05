import React, { useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Analytics from './pages/Analytics.jsx';
import Sales from './pages/Sales.jsx';
import Movement from './pages/Movement.jsx';
import Visits from './pages/Visits.jsx';
import Setup from './pages/Setup.jsx';
import Users from './pages/Users.jsx';
import IncentiveSettings from './pages/IncentiveSettings.jsx';
import Clients from './pages/Clients.jsx';
import Products from './pages/Products.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = [
    ['/', 'Overview'],
    ['/analytics', 'Analytics'],
    ['/sales', 'Sales'],
    ['/movement', 'Movement'],
    ['/visits', 'Visits'],
    ['/clients', 'Clients'],
    ['/products', 'Products'],
    ['/setup', 'Targets'],
    ['/incentives', 'Incentive Settings'],
    ['/users', 'User Management'],
  ];
  return (
    <div className="layout">
      <button className="hamburger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">☰</button>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <h1 className="brand">Ara Sales</h1>
        <nav>
          {nav.map(([to, label]) => (
            <Link key={to} to={to} className={loc.pathname === to ? 'active' : ''} onClick={() => setMenuOpen(false)}>{label}</Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="muted">{user?.name}</div>
          <button onClick={logout}>Log out</button>
        </div>
      </aside>
      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
      <main className="content">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Shell><Overview /></Shell></RequireAuth>} />
      <Route path="/analytics" element={<RequireAuth><Shell><Analytics /></Shell></RequireAuth>} />
      <Route path="/users" element={<RequireAuth><Shell><Users /></Shell></RequireAuth>} />
      <Route path="/sales" element={<RequireAuth><Shell><Sales /></Shell></RequireAuth>} />
      <Route path="/movement" element={<RequireAuth><Shell><Movement /></Shell></RequireAuth>} />
      <Route path="/visits" element={<RequireAuth><Shell><Visits /></Shell></RequireAuth>} />
      <Route path="/setup" element={<RequireAuth><Shell><Setup /></Shell></RequireAuth>} />
      <Route path="/incentives" element={<RequireAuth><Shell><IncentiveSettings /></Shell></RequireAuth>} />
      <Route path="/clients" element={<RequireAuth><Shell><Clients /></Shell></RequireAuth>} />
      <Route path="/products" element={<RequireAuth><Shell><Products /></Shell></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
