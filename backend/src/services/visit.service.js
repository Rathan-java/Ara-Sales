'use strict';

/**
 * Visit verification business logic (anti-fraud core).
 *
 * PURE module: geofence math, one-time code validation, and status decision are
 * all side-effect free so they can be unit-tested without a DB or HTTP layer.
 * Random code generation is the one exception and accepts an injectable RNG.
 */

const crypto = require('crypto');

// Geofence radius in metres. Capture beyond this from the client's reference
// point is flagged/rejected.
const GEOFENCE_RADIUS_M = 150;

// One-time visit code lifetime in seconds (spec: ~60-90s).
const CODE_TTL_SECONDS = 90;

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points, in metres (Haversine).
 * @returns {number} metres
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Generate a short, single-use visit code + issue/expiry timestamps.
 * @param {object} [opts]
 * @param {() => Date} [opts.now] clock (defaults to real time)
 * @param {() => string} [opts.rng] returns a code string (defaults to crypto)
 * @param {number} [opts.ttlSeconds]
 * @returns {{ code:string, issuedAt:Date, expiresAt:Date }}
 */
function generateVisitCode(opts = {}) {
  const now = opts.now ? opts.now() : new Date();
  const ttl = opts.ttlSeconds ?? CODE_TTL_SECONDS;
  const code = opts.rng
    ? opts.rng()
    : crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const issuedAt = now;
  const expiresAt = new Date(now.getTime() + ttl * 1000);
  return { code, issuedAt, expiresAt };
}

/**
 * Validate a presented one-time code against the issued visit record.
 *
 * Rejects when: wrong code, already used, or expired.
 *
 * @param {object} visit  the issued visit row
 * @param {string} visit.visit_code
 * @param {boolean} visit.code_used
 * @param {Date|string} visit.code_expires_at
 * @param {string} presentedCode
 * @param {Date} [now]
 * @returns {{ valid:boolean, reason?:'wrong_code'|'used'|'expired' }}
 */
function validateVisitCode(visit, presentedCode, now = new Date()) {
  if (!visit || String(visit.visit_code) !== String(presentedCode)) {
    return { valid: false, reason: 'wrong_code' };
  }
  if (visit.code_used) {
    return { valid: false, reason: 'used' };
  }
  const expiresAt = visit.code_expires_at instanceof Date
    ? visit.code_expires_at
    : new Date(visit.code_expires_at);
  if (now.getTime() > expiresAt.getTime()) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true };
}

/**
 * Evaluate the geofence for a capture against a client reference point.
 *
 * For a brand-new client with no reference, the caller should store the first
 * verified capture as the reference; here we report `noReference: true` and pass.
 *
 * @param {object} input
 * @param {number|null} input.referenceLat
 * @param {number|null} input.referenceLng
 * @param {number} input.captureLat
 * @param {number} input.captureLng
 * @param {number} [input.radiusM]
 * @returns {{ pass:boolean, distanceM:number|null, noReference:boolean }}
 */
function evaluateGeofence(input) {
  const radius = input.radiusM ?? GEOFENCE_RADIUS_M;
  const hasRef =
    input.referenceLat !== null && input.referenceLat !== undefined &&
    input.referenceLng !== null && input.referenceLng !== undefined;

  if (!hasRef) {
    return { pass: true, distanceM: null, noReference: true };
  }

  const distanceM = haversineMeters(
    Number(input.referenceLat),
    Number(input.referenceLng),
    Number(input.captureLat),
    Number(input.captureLng),
  );
  return { pass: distanceM <= radius, distanceM, noReference: false };
}

/**
 * Decide the final visit status from the anti-fraud checks.
 *
 * - invalid one-time code            -> 'reject' (the code is server-issued)
 * - valid code but out-of-geofence   -> 'flag'  (accepted; surfaced to HR)
 * - all checks pass                  -> 'pass'
 *
 * (Mock-/fake-GPS detection was removed — it false-positived on genuine phones.)
 *
 * @param {object} checks
 * @param {boolean} checks.codeValid
 * @param {boolean} checks.geofencePass
 * @returns {'pass'|'flag'|'reject'}
 */
function decideVisitStatus(checks) {
  if (!checks.codeValid) return 'reject';
  if (!checks.geofencePass) return 'flag';
  return 'pass';
}

module.exports = {
  GEOFENCE_RADIUS_M,
  CODE_TTL_SECONDS,
  haversineMeters,
  generateVisitCode,
  validateVisitCode,
  evaluateGeofence,
  decideVisitStatus,
};
