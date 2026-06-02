'use strict';

/**
 * Lightweight audit logging. Best-effort: a failure to write an audit row must
 * never break the actual operation, so all errors are swallowed.
 */

const db = require('../db/knex');

/**
 * @param {object} actor   req.user ({ id, email })
 * @param {string} action  e.g. 'user.create', 'user.update', 'user.deactivate', 'user.delete', 'export'
 * @param {object} [opts]  { targetType, targetId, detail }
 */
async function record(actor, action, opts = {}) {
  try {
    await db('audit_logs').insert({
      actor_id: actor && actor.id ? actor.id : null,
      actor_email: actor && actor.email ? actor.email : null,
      action,
      target_type: opts.targetType || null,
      target_id: opts.targetId != null ? String(opts.targetId) : null,
      detail: opts.detail ? JSON.stringify(opts.detail) : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[audit] could not record', action, '-', err.message);
  }
}

/** Recent audit entries (admin view). */
async function recent(limit = 100) {
  return db('audit_logs').orderBy('created_at', 'desc').limit(limit);
}

module.exports = { record, recent };
