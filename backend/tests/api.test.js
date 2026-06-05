'use strict';

/**
 * API integration tests for critical endpoints.
 *
 * Requires a reachable MySQL (configured via .env / env vars) and the dev
 * packages installed (`npm install`). Run with: npm run test:api
 *
 * It runs migrations + seed against the configured DB, then exercises:
 *  - email/OTP login -> JWT
 *  - role-based authorization (rep blocked from admin routes)
 *  - salary never leaks in a rep-facing response
 *  - sales entry creation + dashboard recompute
 *  - visit verification rejects a wrong one-time code
 *
 * If the DB is unreachable, the whole suite is skipped (not failed) so the
 * pure-logic suite remains the gate.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

let request; let createApp; let db; let app; let dbUp = true;

try {
  request = require('supertest');
  ({ createApp } = require('../src/app'));
  db = require('../src/db/knex');
} catch (err) {
  dbUp = false;
  // eslint-disable-next-line no-console
  console.error('Skipping API tests (deps missing):', err.message);
}

test('API integration', { concurrency: false }, async (t) => {
  if (!dbUp) {
    t.skip('dependencies not installed');
    return;
  }
  try {
    await db.raw('SELECT 1');
  } catch {
    t.skip('MySQL not reachable; configure .env and run `npm run db:reset`');
    return;
  }

  await db.migrate.rollback({}, true);
  await db.migrate.latest();
  await db.seed.run();
  app = createApp();

  let repToken; let adminToken;

  const SEED_PASSWORD = 'ChangeMe@123';

  await t.test('rep can log in with email + password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ravi@ara.test', password: SEED_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'rep');
    repToken = res.body.token;
  });

  await t.test('login fails with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ravi@ara.test', password: 'wrong-password' });
    assert.equal(res.status, 401);
  });

  await t.test('admin can log in with password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@ara.test', password: SEED_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'admin');
    adminToken = res.body.token;
  });

  await t.test('old OTP-login endpoint is gone (404)', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'ravi@ara.test', otp: '000000' });
    assert.equal(res.status, 404);
  });

  await t.test('forgot/reset flow sets a new password that works', async () => {
    // 1. request a reset (dev returns generic success; DEV_OTP is accepted)
    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'meena@ara.test' });
    assert.equal(forgot.status, 200);

    // 2. verify the OTP (DEV_OTP in development)
    const verify = await request(app)
      .post('/api/auth/verify-reset-otp')
      .send({ email: 'meena@ara.test', otp: process.env.DEV_OTP || '000000' });
    assert.equal(verify.status, 200);

    // 3. reset to a new password
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'meena@ara.test', otp: process.env.DEV_OTP || '000000', newPassword: 'NewPass@456' });
    assert.equal(reset.status, 200);

    // 4. old password no longer works, new one does
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'meena@ara.test', password: SEED_PASSWORD });
    assert.equal(oldLogin.status, 401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'meena@ara.test', password: 'NewPass@456' });
    assert.equal(newLogin.status, 200);
  });

  await t.test('reset-password rejects too-short passwords', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'meena@ara.test' });
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'meena@ara.test', otp: process.env.DEV_OTP || '000000', newPassword: 'short' });
    assert.equal(res.status, 400);
  });

  await t.test('rep is forbidden from admin routes (RBAC)', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${repToken}`);
    assert.equal(res.status, 403);
  });

  await t.test('rep dashboard never exposes salary', async () => {
    const res = await request(app)
      .get('/api/rep/dashboard')
      .set('Authorization', `Bearer ${repToken}`);
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.body).toLowerCase();
    assert.ok(!body.includes('salary'), 'rep response must not contain salary');
    assert.ok(!body.includes('monthly_salary'));
  });

  await t.test('admin overview includes salary + incentive', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    const ravi = res.body.reps.find((r) => r.email === 'ravi@ara.test');
    assert.ok(ravi);
    assert.equal(ravi.monthlySalary, 20000);
    // Tiered incentive: seed surplus = 120000-100000 = 20000, first slab 5% => 1000.
    assert.equal(ravi.incentiveAmount, 1000);
  });

  await t.test('input validation rejects a bad sales entry', async () => {
    const res = await request(app)
      .post('/api/rep/sales')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ clientName: '', leadMode: 'nope', leadType: 'hot', amount: -5, saleDate: 'bad' });
    assert.equal(res.status, 400);
  });

  await t.test('rep can add a valid sales entry (product + lead mode + lead type)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .post('/api/rep/sales')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ clientName: 'Test School', product: 'SchoolMate', leadMode: 'platform', leadType: 'hot', amount: 1000, saleDate: today });
    assert.equal(res.status, 201);
  });

  await t.test('sales entry rejects an unknown product', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .post('/api/rep/sales')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ clientName: 'X', product: 'NoSuchProduct', leadMode: 'platform', leadType: 'hot', amount: 100, saleDate: today });
    assert.equal(res.status, 400);
  });

  await t.test('products: add, list, delete; re-add deleted name works; dup blocked', async () => {
    const add = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'TestProd' });
    assert.equal(add.status, 201);
    const dup = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'TestProd' });
    assert.equal(dup.status, 409); // active dup blocked
    const del = await request(app).delete(`/api/admin/products/${add.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(del.status, 200);
    const readd = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'TestProd' });
    assert.equal(readd.status, 201); // deleted name can be created again
  });

  await t.test('visit verification rejects a wrong one-time code', async () => {
    const start = await request(app)
      .post('/api/rep/visits/start')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ clientId: 1 });
    assert.equal(start.status, 201);
    const res = await request(app)
      .post('/api/rep/visits/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .field('visitId', String(start.body.visitId))
      .field('visitCode', '000000') // wrong
      .field('captureLat', '12.9716')
      .field('captureLng', '77.5946')
      .attach('photo', Buffer.from('fake-jpeg-bytes'), 'photo.jpg');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details.codeValid, false);
  });

  async function makeClient(name) {
    const created = await request(app)
      .post('/api/rep/clients')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ name });
    assert.equal(created.status, 201);
    return created.body.id;
  }
  async function getClient(id) {
    const r = await request(app).get('/api/admin/clients').set('Authorization', `Bearer ${adminToken}`);
    return r.body.clients.find((x) => x.id === id);
  }

  await t.test('real capture at an unset client AUTO-SETS its location (approved)', async () => {
    const id = await makeClient('Auto Location Client');
    const start = await request(app)
      .post('/api/rep/visits/start').set('Authorization', `Bearer ${repToken}`)
      .send({ clientId: id });
    const res = await request(app)
      .post('/api/rep/visits/submit').set('Authorization', `Bearer ${repToken}`)
      .field('visitId', String(start.body.visitId))
      .field('visitCode', start.body.visitCode)
      .field('captureLat', '11.0001').field('captureLng', '79.0001')
      .attach('photo', Buffer.from('fake-jpeg-bytes'), 'photo.jpg');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'pass');
    const c = await getClient(id);
    assert.equal(c.location_status, 'approved');
    assert.ok(c.reference_lat != null, 'reference_lat auto-set from the capture');
  });

  await t.test('out-of-geofence visit is FLAGGED (not rejected) at an approved client', async () => {
    // Make a fresh client and have HR set an approved location (12.97, 77.59).
    const id = await makeClient('Geofence Client');
    const setLoc = await request(app)
      .put(`/api/admin/clients/${id}/location`).set('Authorization', `Bearer ${adminToken}`)
      .send({ googleLocation: '12.9716, 77.5946' });
    assert.equal(setLoc.status, 200);

    const start = await request(app)
      .post('/api/rep/visits/start').set('Authorization', `Bearer ${repToken}`)
      .send({ clientId: id });
    const res = await request(app)
      .post('/api/rep/visits/submit').set('Authorization', `Bearer ${repToken}`)
      .field('visitId', String(start.body.visitId))
      .field('visitCode', start.body.visitCode)
      .field('captureLat', '11.0001').field('captureLng', '79.0001') // ~far away
      .attach('photo', Buffer.from('fake-jpeg-bytes'), 'photo.jpg');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'flag');
  });

  await t.test('admin export returns an xlsx stream', async () => {
    const res = await request(app)
      .get('/api/admin/export')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /spreadsheetml/);
  });

  await db.destroy();
});
