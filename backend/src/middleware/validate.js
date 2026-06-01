'use strict';

const { ApiError } = require('./error');

/**
 * Schema validation middleware backed by zod. Validates and REPLACES
 * req.body / req.query / req.params with the parsed (coerced) values so
 * downstream handlers receive clean, typed data.
 *
 * Usage: validate({ body: schema, query: schema, params: schema })
 */
function validate(schemas) {
  return (req, res, next) => {
    try {
      for (const key of ['body', 'query', 'params']) {
        if (schemas[key]) {
          const result = schemas[key].safeParse(req[key]);
          if (!result.success) {
            const details = result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            }));
            throw ApiError.badRequest('Validation failed', details);
          }
          // req.query/params can be read-only getters on some setups; assign defensively.
          try {
            req[key] = result.data;
          } catch {
            Object.defineProperty(req, key, { value: result.data, writable: true });
          }
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validate };
