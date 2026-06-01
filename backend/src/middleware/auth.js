'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { ApiError } = require('./error');

/**
 * Verify the JWT from the Authorization header and attach req.user.
 * Role is taken from the signed token only — never from the client body/query.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { id: payload.sub, role: payload.role, email: payload.email, name: payload.name };
    return next();
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}

/**
 * Role-based authorization. Server-side enforcement; the client can never
 * elevate its own role because we read it from the verified token.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    return next();
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

module.exports = { authenticate, requireRole, signToken };
