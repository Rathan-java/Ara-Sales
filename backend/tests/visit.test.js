'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  haversineMeters,
  generateVisitCode,
  validateVisitCode,
  evaluateGeofence,
  decideVisitStatus,
} = require('../src/services/visit.service');

test('haversine: same point is ~0 m', () => {
  assert.ok(haversineMeters(12.9716, 77.5946, 12.9716, 77.5946) < 0.001);
});

test('haversine: ~111 m for ~0.001 deg latitude', () => {
  const d = haversineMeters(12.9716, 77.5946, 12.9726, 77.5946);
  assert.ok(d > 100 && d < 120, `expected ~111m, got ${d}`);
});

test('geofence: within radius passes', () => {
  const r = evaluateGeofence({
    referenceLat: 12.9716, referenceLng: 77.5946,
    captureLat: 12.9717, captureLng: 77.5947,
  });
  assert.equal(r.pass, true);
  assert.equal(r.noReference, false);
});

test('geofence: beyond 150 m fails (flag)', () => {
  const r = evaluateGeofence({
    referenceLat: 12.9716, referenceLng: 77.5946,
    captureLat: 12.9756, captureLng: 77.5946, // ~445 m north
  });
  assert.equal(r.pass, false);
});

test('geofence: no reference passes and reports noReference', () => {
  const r = evaluateGeofence({
    referenceLat: null, referenceLng: null,
    captureLat: 12.9716, captureLng: 77.5946,
  });
  assert.equal(r.pass, true);
  assert.equal(r.noReference, true);
});

test('visit code: valid within TTL', () => {
  const now = new Date('2026-05-30T10:00:00Z');
  const { code, expiresAt } = generateVisitCode({ now: () => now, rng: () => '123456' });
  const visit = { visit_code: code, code_used: false, code_expires_at: expiresAt };
  const res = validateVisitCode(visit, '123456', new Date('2026-05-30T10:00:30Z'));
  assert.equal(res.valid, true);
});

test('visit code: wrong code rejected', () => {
  const visit = { visit_code: '123456', code_used: false, code_expires_at: new Date(Date.now() + 60000) };
  const res = validateVisitCode(visit, '000000', new Date());
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'wrong_code');
});

test('visit code: used code rejected', () => {
  const visit = { visit_code: '123456', code_used: true, code_expires_at: new Date(Date.now() + 60000) };
  const res = validateVisitCode(visit, '123456', new Date());
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'used');
});

test('visit code: expired code rejected', () => {
  const now = new Date('2026-05-30T10:00:00Z');
  const { code, expiresAt } = generateVisitCode({ now: () => now, rng: () => '123456' });
  const visit = { visit_code: code, code_used: false, code_expires_at: expiresAt };
  const res = validateVisitCode(visit, '123456', new Date('2026-05-30T10:05:00Z')); // 5 min later
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'expired');
});

test('status: all checks pass -> pass', () => {
  assert.equal(decideVisitStatus({ codeValid: true, geofencePass: true, mockLocation: false }), 'pass');
});

test('status: out-of-geofence -> flag', () => {
  assert.equal(decideVisitStatus({ codeValid: true, geofencePass: false, mockLocation: false }), 'flag');
});

test('status: mock location -> reject', () => {
  assert.equal(decideVisitStatus({ codeValid: true, geofencePass: true, mockLocation: true }), 'reject');
});

test('status: invalid code -> reject', () => {
  assert.equal(decideVisitStatus({ codeValid: false, geofencePass: true, mockLocation: false }), 'reject');
});
