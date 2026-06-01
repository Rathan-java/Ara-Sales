import React, { createContext, useContext, useState } from 'react';
import { api } from './api/client.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('ara_user');
    return raw ? JSON.parse(raw) : null;
  });

  // Primary login: email + password.
  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.user.role !== 'admin') {
      throw new Error('This dashboard is for admins only. Reps use the mobile app.');
    }
    localStorage.setItem('ara_token', data.token);
    localStorage.setItem('ara_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  // Forgot-password flow (OTP via email).
  async function forgotPassword(email) {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  }
  async function verifyResetOtp(email, otp) {
    const { data } = await api.post('/auth/verify-reset-otp', { email, otp });
    return data;
  }
  async function resetPassword(email, otp, newPassword) {
    const { data } = await api.post('/auth/reset-password', { email, otp, newPassword });
    return data;
  }

  function logout() {
    localStorage.removeItem('ara_token');
    localStorage.removeItem('ara_user');
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, login, forgotPassword, verifyResetOtp, resetPassword, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
