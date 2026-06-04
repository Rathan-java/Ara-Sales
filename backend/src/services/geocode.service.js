'use strict';

/**
 * Parse a Google Maps location into { lat, lng }.
 *
 * Supports (no API key needed):
 *   - plain coords:            "12.9716, 77.5946"  or  "12.9716,77.5946"
 *   - maps URL with @:         https://www.google.com/maps/@12.9716,77.5946,15z
 *   - maps URL with !3d!4d:    .../data=...!3d12.9716!4d77.5946...
 *   - ?q=lat,lng / ?ll=lat,lng / query=lat,lng
 *   - short links (maps.app.goo.gl / goo.gl/maps): resolved via HTTP redirect
 *
 * The pure parser (parseCoordsFromText) is synchronous & unit-testable.
 * resolveGoogleMapsLocation() additionally follows short-link redirects.
 */

const https = require('https');
const http = require('http');

function valid(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Extract coordinates from a string (plain coords or any full Maps URL form).
 * @returns {{lat:number,lng:number}|null}
 */
function parseCoordsFromText(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();

  // 1) !3d<lat>!4d<lng> (most precise — the actual placed pin)
  let m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) {
    const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 2) @lat,lng (map center)
  m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) {
    const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 3) q= / ll= / query= = lat,lng
  m = s.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) {
    const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 4) "Latitude: <lat> Longitude: <lng>" (common copy format, any separator)
  m = s.match(/lat(?:itude)?\s*[:=]?\s*(-?\d+(?:\.\d+)?)[\s,;]+long?(?:itude)?\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  if (m) {
    const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 5) plain "lat, lng" (only if the WHOLE string is basically that)
  m = s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (m) {
    const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 6) two bare numbers separated by space/comma anywhere (last resort)
  m = s.match(/(-?\d{1,2}\.\d+)[\s,]+(-?\d{1,3}\.\d+)/);
  if (m) {
    const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  return null;
}

/** Follow one HTTP redirect and return the Location header (for short links). */
function fetchRedirect(url) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.request(url, { method: 'GET', timeout: 8000 }, (res) => {
        const loc = res.headers.location;
        // Drain & close; we only need headers / a bit of body.
        let body = '';
        res.on('data', (c) => { if (body.length < 20000) body += c; });
        res.on('end', () => resolve({ location: loc, body }));
      });
      req.on('error', () => resolve({ location: null, body: '' }));
      req.on('timeout', () => { req.destroy(); resolve({ location: null, body: '' }); });
      req.end();
    } catch {
      resolve({ location: null, body: '' });
    }
  });
}

/**
 * Resolve any Google Maps input (incl. short links) to { lat, lng }.
 * @returns {Promise<{lat:number,lng:number}|null>}
 */
async function resolveGoogleMapsLocation(input) {
  // Try the direct parse first.
  const direct = parseCoordsFromText(input);
  if (direct) return direct;

  const s = String(input || '').trim();
  const isShort = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s);
  if (!isShort) return null;

  // Follow up to 5 redirects, parsing each hop's URL and body.
  let url = s;
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { location, body } = await fetchRedirect(url);
    const fromBody = parseCoordsFromText(body);
    if (fromBody) return fromBody;
    if (!location) break;
    const fromLoc = parseCoordsFromText(location);
    if (fromLoc) return fromLoc;
    url = location.startsWith('http') ? location : new URL(location, url).toString();
  }
  return null;
}

module.exports = { parseCoordsFromText, resolveGoogleMapsLocation };
