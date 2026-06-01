'use strict';

/**
 * Centralized error handling. Routes throw ApiError (or call next(err)); this
 * is the single place that shapes the JSON error response.
 */

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
  static badRequest(msg, details) { return new ApiError(400, msg, details); }
  static unauthorized(msg = 'Unauthorized') { return new ApiError(401, msg); }
  static forbidden(msg = 'Forbidden') { return new ApiError(403, msg); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg); }
  static conflict(msg, details) { return new ApiError(409, msg, details); }
}

// 404 for unmatched routes.
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// Final error handler — must keep 4 args for Express to recognise it.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const payload = {
    error: {
      message: err.message || 'Internal Server Error',
      ...(err.details ? { details: err.details } : {}),
    },
  };
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }
  res.status(status).json(payload);
}

// Wrap async route handlers so thrown/rejected errors reach errorHandler.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { ApiError, notFoundHandler, errorHandler, asyncHandler };
