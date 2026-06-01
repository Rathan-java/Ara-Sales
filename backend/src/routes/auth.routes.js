'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/error');
const { authenticate, signToken } = require('../middleware/auth');
const config = require('../config');
const authService = require('../services/auth.service');

const router = express.Router();

// Rate-limit failed-prone auth endpoints. Keyed by email+IP so one user hammering
// is throttled without blocking a whole NAT. Counts all requests in the window.
const loginLimiter = rateLimit({
  windowMs: config.auth.loginWindowMinutes * 60 * 1000,
  max: config.auth.loginMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${(req.body && req.body.email) || ''}|${req.ip}`,
  message: { error: { message: 'Too many login attempts. Try again later.' } },
});

const forgotLimiter = rateLimit({
  windowMs: config.auth.forgotWindowMinutes * 60 * 1000,
  max: config.auth.forgotMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${(req.body && req.body.email) || ''}|${req.ip}`,
  message: { error: { message: 'Too many requests. Try again later.' } },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const emailSchema = z.object({ email: z.string().email() });
const verifyResetSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(4).max(8),
});
const resetSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(4).max(8),
  newPassword: z.string().min(config.auth.minPasswordLength),
});

function userPayload(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// POST /api/auth/login  -> email + password -> JWT
router.post('/login', loginLimiter, validate({ body: loginSchema }), asyncHandler(async (req, res) => {
  const user = await authService.loginWithPassword(req.body.email, req.body.password);
  const token = signToken(user);
  res.json({ ok: true, token, user: userPayload(user) });
}));

// POST /api/auth/forgot-password  -> always generic success (no enumeration)
router.post('/forgot-password', forgotLimiter, validate({ body: emailSchema }), asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.json({ ok: true, message: 'If an account exists for that email, a code has been sent.' });
}));

// POST /api/auth/verify-reset-otp  -> check the code (does not consume it)
router.post('/verify-reset-otp', validate({ body: verifyResetSchema }), asyncHandler(async (req, res) => {
  await authService.verifyResetOtp(req.body.email, req.body.otp);
  res.json({ ok: true });
}));

// POST /api/auth/reset-password  -> set new password, consume the OTP
router.post('/reset-password', validate({ body: resetSchema }), asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.email, req.body.otp, req.body.newPassword);
  res.json({ ok: true, message: 'Password updated. You can now log in.' });
}));

// GET /api/auth/me -> current user from token
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));

module.exports = router;
