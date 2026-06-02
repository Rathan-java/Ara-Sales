'use strict';

/**
 * Authentication service.
 *
 * Primary login is email + PASSWORD (bcrypt). Email OTP is used ONLY for
 * password recovery (forgot-password -> verify -> reset).
 *
 * Reset OTPs are stored bcrypt-HASHED in the `password_resets` table (never in
 * plaintext), are single-use, and expire after config.otp.ttlSeconds. In
 * development, DEV_OTP is also accepted so the flow is demoable without email.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db/knex');
const { ApiError } = require('../middleware/error');
const { sendOtpEmail } = require('./email.service');

async function findUserByEmail(email) {
  return db('users').where({ email: String(email).toLowerCase() }).first();
}

function hashPassword(plain) {
  return bcrypt.hash(plain, config.auth.bcryptRounds);
}

/**
 * Verify email + password and return the user on success.
 * Throws 401 on unknown email, no password set, or wrong password.
 * Uses a uniform error message to avoid leaking which part failed.
 */
async function loginWithPassword(email, password) {
  const user = await findUserByEmail(email);
  const invalid = ApiError.unauthorized('Invalid email or password');
  if (!user || !user.password_hash) {
    // Still run a bcrypt compare against a dummy hash to reduce timing signal.
    await bcrypt.compare(password, '$2a$10$abcdefghijklmnopqrstuv0123456789abcdefghijklmno1234');
    throw invalid;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw invalid;
  // Deactivated accounts cannot log in (web or mobile), but their data is kept.
  if (user.active === false || user.active === 0) {
    throw ApiError.forbidden('This account has been deactivated. Contact your administrator.');
  }
  return user;
}

/**
 * Set (or reset) a user's password. Enforces the minimum length.
 */
async function setUserPassword(userId, newPassword) {
  if (!newPassword || newPassword.length < config.auth.minPasswordLength) {
    throw ApiError.badRequest(
      `Password must be at least ${config.auth.minPasswordLength} characters`,
    );
  }
  const password_hash = await hashPassword(newPassword);
  await db('users').where({ id: userId }).update({ password_hash });
}

function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Begin password recovery: issue a 6-digit OTP, store it HASHED with an expiry,
 * invalidate previous unused OTPs for the user, and email it.
 *
 * Always resolves the same way regardless of whether the email exists, so the
 * caller can return a generic success (no account enumeration).
 */
async function forgotPassword(email) {
  const user = await findUserByEmail(email);
  if (!user) return { ok: true }; // generic success; do not reveal absence

  // Invalidate any prior unused OTPs for this user.
  await db('password_resets').where({ user_id: user.id, used: false }).update({ used: true });

  const otp = config.env === 'production' ? generateOtp() : config.otp.devOtp;
  const otpHash = await bcrypt.hash(otp, config.auth.bcryptRounds);
  const expiresAt = new Date(Date.now() + config.otp.ttlSeconds * 1000);

  await db('password_resets').insert({
    user_id: user.id,
    otp_hash: otpHash,
    expires_at: expiresAt,
    used: false,
  });

  // Email the plaintext code (best-effort; logs to console if SMTP not set).
  try {
    await sendOtpEmail(user.email, otp);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth] failed to send reset email:', err.message);
  }
  return { ok: true };
}

/**
 * Find the active (unused, unexpired) reset row whose hashed OTP matches.
 * In development, DEV_OTP is accepted against the latest active row.
 * @returns {Promise<{user:object, reset:object}|null>}
 */
async function findValidReset(email, otp) {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const now = new Date();
  const candidates = await db('password_resets')
    .where({ user_id: user.id, used: false })
    .andWhere('expires_at', '>', now)
    .orderBy('created_at', 'desc');

  if (candidates.length === 0) return null;

  // Dev shortcut: accept DEV_OTP against the most recent active row.
  if (config.env !== 'production' && String(otp) === String(config.otp.devOtp)) {
    return { user, reset: candidates[0] };
  }

  for (const row of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const match = await bcrypt.compare(String(otp), row.otp_hash);
    if (match) return { user, reset: row };
  }
  return null;
}

/**
 * Verify a reset OTP without consuming it (step 2 of the UI).
 */
async function verifyResetOtp(email, otp) {
  const found = await findValidReset(email, otp);
  if (!found) throw ApiError.unauthorized('Invalid or expired code');
  return { ok: true };
}

/**
 * Complete the reset: re-verify the OTP, set the new password, mark OTP used.
 */
async function resetPassword(email, otp, newPassword) {
  const found = await findValidReset(email, otp);
  if (!found) throw ApiError.unauthorized('Invalid or expired code');

  await setUserPassword(found.user.id, newPassword); // enforces min length
  await db('password_resets').where({ id: found.reset.id }).update({ used: true });
  // Invalidate any other outstanding OTPs for safety.
  await db('password_resets')
    .where({ user_id: found.user.id, used: false })
    .update({ used: true });
  return { ok: true };
}

module.exports = {
  findUserByEmail,
  hashPassword,
  loginWithPassword,
  setUserPassword,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
};
