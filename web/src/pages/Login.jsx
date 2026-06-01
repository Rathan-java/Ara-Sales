import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login, forgotPassword, verifyResetOtp, resetPassword } = useAuth();
  const nav = useNavigate();

  // 'login' | 'forgot-email' | 'forgot-otp' | 'forgot-reset'
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('admin@ara.test');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function reset(msgKeep = false) {
    setError('');
    if (!msgKeep) setInfo('');
  }

  async function doLogin(e) {
    e.preventDefault();
    reset(); setBusy(true);
    try {
      await login(email, password);
      nav('/');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally { setBusy(false); }
  }

  async function doForgotEmail(e) {
    e.preventDefault();
    reset(); setBusy(true);
    try {
      await forgotPassword(email);
      setInfo('If an account exists, a 6-digit code has been emailed. Enter it below.');
      setMode('forgot-otp');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally { setBusy(false); }
  }

  async function doVerifyOtp(e) {
    e.preventDefault();
    reset(); setBusy(true);
    try {
      await verifyResetOtp(email, otp);
      setInfo('Code verified. Set your new password.');
      setMode('forgot-reset');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally { setBusy(false); }
  }

  async function doReset(e) {
    e.preventDefault();
    reset();
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      await resetPassword(email, otp, newPassword);
      setInfo('Password updated. Please log in.');
      setPassword(''); setOtp(''); setNewPassword(''); setConfirm('');
      setMode('login');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1 className="brand">Ara Sales</h1>
        <p className="muted">Management dashboard</p>

        {mode === 'login' && (
          <form onSubmit={doLogin}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            <label>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            {error && <div className="error">{error}</div>}
            {info && <div className="hint">{info}</div>}
            <button type="submit" disabled={busy}>{busy ? '…' : 'Log in'}</button>
            <button type="button" className="linklike" onClick={() => { reset(); setMode('forgot-email'); }}>
              Forgot password?
            </button>
          </form>
        )}

        {mode === 'forgot-email' && (
          <form onSubmit={doForgotEmail}>
            <p className="muted">Step 1 of 3 — enter your email to receive a code.</p>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>{busy ? '…' : 'Send code'}</button>
            <button type="button" className="linklike" onClick={() => { reset(); setMode('login'); }}>Back to login</button>
          </form>
        )}

        {mode === 'forgot-otp' && (
          <form onSubmit={doVerifyOtp}>
            <p className="muted">Step 2 of 3 — enter the 6-digit code sent to {email}.</p>
            <label>Verification code</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" required />
            {info && <div className="hint">{info}</div>}
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>{busy ? '…' : 'Verify code'}</button>
            <button type="button" className="linklike" onClick={() => { reset(); setMode('forgot-email'); }}>Back</button>
          </form>
        )}

        {mode === 'forgot-reset' && (
          <form onSubmit={doReset}>
            <p className="muted">Step 3 of 3 — set a new password (min 8 characters).</p>
            <label>New password</label>
            <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" required />
            <label>Confirm password</label>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required />
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>{busy ? '…' : 'Set new password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
