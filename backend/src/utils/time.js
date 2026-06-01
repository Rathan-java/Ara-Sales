'use strict';

/**
 * Server-time helpers. All visit stamps and code timing use SERVER time, never
 * the client clock (anti-fraud requirement).
 */

function nowUtc() {
  return new Date();
}

/** YYYY-MM for a given date (UTC). */
function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** MySQL DATETIME string (UTC) 'YYYY-MM-DD HH:MM:SS'. */
function toMysqlDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = { nowUtc, monthKey, toMysqlDateTime };
