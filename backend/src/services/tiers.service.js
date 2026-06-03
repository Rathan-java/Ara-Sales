'use strict';

/**
 * Loads and saves the HR-configured incentive slab scale (global scope).
 * The pure math lives in incentive.service (computeTieredIncentive/validateTiers).
 */

const db = require('../db/knex');
const { validateTiers } = require('./incentive.service');
const { ApiError } = require('../middleware/error');

/** Return the global tiers as [{from, to, percent}] sorted by from. */
async function getGlobalTiers() {
  const rows = await db('incentive_tiers')
    .where({ scope: 'global' })
    .orderBy('slab_order')
    .select('from_amount', 'to_amount', 'percent', 'slab_order');
  return rows.map((r) => ({
    from: Number(r.from_amount),
    to: r.to_amount === null || r.to_amount === undefined ? null : Number(r.to_amount),
    percent: Number(r.percent),
  }));
}

/**
 * Replace the global tiers with a new validated set (transactional).
 * @param {Array<{from:number,to:number|null,percent:number}>} tiers
 */
async function replaceGlobalTiers(tiers) {
  const { valid, errors } = validateTiers(tiers);
  if (!valid) throw ApiError.badRequest('Invalid incentive slabs', errors);

  const sorted = [...tiers].sort((a, b) => (Number(a.from) || 0) - (Number(b.from) || 0));
  await db.transaction(async (trx) => {
    await trx('incentive_tiers').where({ scope: 'global' }).del();
    await trx('incentive_tiers').insert(sorted.map((t, i) => ({
      scope: 'global',
      slab_order: i + 1,
      from_amount: Number(t.from).toFixed(2),
      to_amount: t.to === null || t.to === undefined || t.to === '' ? null : Number(t.to).toFixed(2),
      percent: Number(t.percent).toFixed(3),
      updated_at: db.fn.now(),
    })));
  });
  return getGlobalTiers();
}

module.exports = { getGlobalTiers, replaceGlobalTiers };
