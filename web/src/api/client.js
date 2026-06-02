import axios from 'axios';

// Same-origin by default: the browser calls "/api/..." on the site's own domain,
// and the host (Vercel) rewrites that to the real backend server-side. Because
// the browser only ever talks to its own origin, CORS never applies.
//
// For local dev (Vite on :5173) we fall back to the local backend, or whatever
// VITE_API_BASE_URL is set to. In production VITE_API_BASE_URL is left EMPTY so
// the relative "/api" path is used and the Vercel rewrite handles forwarding.
const configured = import.meta.env.VITE_API_BASE_URL;
const baseURL = configured && configured.trim() !== '' ? configured.replace(/\/$/, '') : '';

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

// Absolute base for non-axios uses (e.g. <img>/<a> to /uploads or exports).
// Empty in production = same-origin relative URLs (proxied by the host).
export const API_BASE = baseURL;
