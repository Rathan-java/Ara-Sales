import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const api = axios.create({ baseURL: `${baseURL}/api` });

// Attach JWT from localStorage to every request.
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('ara_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// On 401, clear session and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('ara_token');
      localStorage.removeItem('ara_user');
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export const API_BASE = baseURL;
