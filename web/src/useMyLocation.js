import { useEffect, useState } from 'react';

// Last-resort fallback if the browser blocks/denies geolocation (rough India centre).
const FALLBACK = [12.9716, 77.5946];

/**
 * Returns the admin's current [lat, lng] via the browser Geolocation API.
 * Asks permission once per session, caches the result in sessionStorage so it
 * doesn't re-prompt on every page. Falls back to FALLBACK if denied/unavailable.
 *
 * @returns {{ center:[number,number], ready:boolean, denied:boolean }}
 */
export function useMyLocation() {
  const [center, setCenter] = useState(() => {
    const cached = sessionStorage.getItem('ara_admin_loc');
    return cached ? JSON.parse(cached) : FALLBACK;
  });
  const [ready, setReady] = useState(() => !!sessionStorage.getItem('ara_admin_loc'));
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ara_admin_loc')) { setReady(true); return; }
    if (!('geolocation' in navigator)) { setDenied(true); setReady(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = [pos.coords.latitude, pos.coords.longitude];
        sessionStorage.setItem('ara_admin_loc', JSON.stringify(c));
        setCenter(c); setReady(true);
      },
      () => { setDenied(true); setReady(true); }, // denied/error -> keep fallback
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, []);

  return { center, ready, denied };
}
