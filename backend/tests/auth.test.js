'use strict';

/**
 * Auth service integration tests (need MySQL + seed). Focus on the reset-OTP
 * security rules that are hard to exercise purely over HTTP:
 *   - expired OTP rejected
 *   - used OTP cannot be reused
 *   - DEV_OTP works only when NODE_ENV=development
 *
 * Run with: npm run test:auth   (skips cleanly if MySQL is unreachable)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

let db; let authService; let config; let up = true;
try {
  db = require('../src/db/knex');
  authService = require('../src/services/auth.service');
  config = require('../src/config');
} catch (err) {
  up = false;
  // eslint-disable-next-line no-console
  console.error('Skipping auth tests (deps missing):', err.message);
}

async function seedUser(email) {
  const hash = await bcrypt.hash('ChangeMe@123', 8);
  const existing = await db('users').where({ email }).first();
  if (existing) {
    await db('users').where({ id: existing.id }).update({ password_hash: hash });
    return existing.id;
  }
  const [id] = await db('users').insert({
    name: 'Auth Test', email, role: 'rep', password_hash: hash,
  });
  return id;
}

test('auth service reset-OTP rules', { concurrency: false }, async (t) => {
  if (!up) { t.skip('deps not installed'); return; }
  try {
    await db.raw('SELECT 1');
  } catch {
    t.skip('MySQL not reachable');
    return;
  }
  // Ensure schema exists.
  await db.migrate.latest();

  const email = 'authtest@ara.test';
  const userId = await seedUser(email);
  // Clean prior resets for a deterministic run.
  await db('password_resets').where({ user_id: userId }).del();

  await t.test('password login works and wrong password fails', async () => {
    const user = await authService.loginWithPassword(email, 'ChangeMe@123');
    assert.equal(user.email, email);
    await assert.rejects(() => authService.loginWithPassword(email, 'nope'));
  });

  await t.test('expired OTP is rejected', async () => {
    const otp = '424242';
    await db('password_resets').insert({
      user_id: userId,
      otp_hash: await bcrypt.hash(otp, 8),
      expires_at: new Date(Date.now() - 1000), // already expired
      used: false,
    });
    await assert.rejects(() => authService.verifyResetOtp(email, otp), /Invalid or expired/);
  });

  await t.test('used OTP cannot be reused', async () => {
    await db('password_resets').where({ user_id: userId }).del();
    const otp = '515151';
    await db('password_resets').insert({
      user_id: userId,
      otp_hash: await bcrypt.hash(otp, 8),
      expires_at: new Date(Date.now() + 60_000),
      used: false,
    });
    // First reset consumes the OTP.
    await authService.resetPassword(email, otp, 'BrandNew@123');
    // Second attempt with the same OTP must fail.
    await assert.rejects(() => authService.resetPassword(email, otp, 'Another@123'), /Invalid or expired/);
    // And the new password works.
    const user = await authService.loginWithPassword(email, 'BrandNew@123');
    assert.equal(user.email, email);
  });

  await t.test('DEV_OTP accepted in development, rejected in production', async () => {
    await db('password_resets').where({ user_id: userId }).del();
    // Need at least one active (unused, unexpired) row for DEV_OTP to latch onto.
    await db('password_resets').insert({
      user_id: userId,
      otp_hash: await bcrypt.hash('999999', 8),
      expires_at: new Date(Date.now() + 60_000),
      used: false,
    });
    const devOtp = config.otp.devOtp;

    const original = config.env;
    config.env = 'development';
    await assert.doesNotReject(() => authService.verifyResetOtp(email, devOtp));

    config.env = 'production';
    await assert.rejects(() => authService.verifyResetOtp(email, devOtp), /Invalid or expired/);
    config.env = original;
  });

  // Cleanup.
  await db('password_resets').where({ user_id: userId }).del();
  await db('users').where({ id: userId }).del();
  await db.destroy();
});
