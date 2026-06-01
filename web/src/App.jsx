import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Sales from './pages/Sales.jsx';
import Movement from './pages/Movement.jsx';
import Visits from './pages/Visits.jsx';
import Setup from './pages/Setup.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = [
    ['/', 'Overview'],
    ['/sales', 'Sales'],
    ['/movement', 'Movement'],
    ['/visits', 'Visits'],
    ['/setup', 'Targets & Salary'],
  ];
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="brand">Ara Sales</h1>
        <nav>
          {nav.map(([to, label]) => (
            <Link key={to} to={to} className={loc.pathname === to ? 'active' : ''}>{label}</Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="muted">{user?.name}</div>
          <button onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Shell><Overview /></Shell></RequireAuth>} />
      <Route path="/sales" element={<RequireAuth><Shell><Sales /></Shell></RequireAuth>} />
      <Route path="/movement" element={<RequireAuth><Shell><Movement /></Shell></RequireAuth>} />
      <Route path="/visits" element={<RequireAuth><Shell><Visits /></Shell></RequireAuth>} />
      <Route path="/setup" element={<RequireAuth><Shell><Setup /></Shell></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
