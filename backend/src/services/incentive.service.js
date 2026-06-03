'use strict';

/**
 * Incentive + target-achievement business logic.
 *
 * IMPORTANT: This module is intentionally PURE (no DB, no I/O, no third-party
 * imports) so it can be unit-tested in isolation and reused on any layer.
 *
 * Money is handled with fixed-precision decimals. We never trust binary floats
 * for currency: all monetary inputs are parsed to integer "paise" (1/100 of a
 * rupee), the arithmetic is done on integers/derived values, and results are
 * rounded to 2 decimal places at the boundary.
 */

/**
 * Parse a money-ish value (string | number) into integer paise.
 * Rejects NaN / Infinity. Rounds half-up at the paise boundary.
 * @param {string|number} value
 * @returns {number} integer paise
 */
function toPaise(value) {
  if (value === null || value === undefined || value === '') {
    throw new TypeError('money value is required');
  }
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw new TypeError(`invalid money value: ${value}`);
  }
  if (num < 0) {
    throw new RangeError(`money value cannot be negative: ${value}`);
  }
  // Round to nearest paise to avoid float drift (e.g. 0.1 + 0.2).
  return Math.round(num * 100);
}

/**
 * Convert integer paise back to a 2-decimal rupee number.
 * @param {number} paise
 * @returns {number}
 */
function fromPaise(paise) {
  return Math.round(paise) / 100;
}

/**
 * Round a number to 2 decimal places (rupees) deterministically.
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Default incentive configuration. The cap/multiplier is implemented but OFF by
 * default per spec, so it can be enabled later without code changes.
 */
const DEFAULT_INCENTIVE_CONFIG = Object.freeze({
  // Multiplier applied to surplus_pct before computing the payout. 1 = no change.
  multiplier: 1,
  // When capEnabled is true, incentive_amount is capped at maxIncentiveAmount.
  capEnabled: false,
  // Max payable incentive in rupees when capEnabled. null = no cap.
  maxIncentiveAmount: null,
});

/**
 * Compute the monthly incentive for a rep.
 *
 * Rule (revenue surplus only, no cap in v1):
 *   surplus_pct = (achieved_amount - revenue_target) / revenue_target * 100
 *   incentive   = surplus_pct% * monthly_salary
 *
 * Paid ONLY when there is a positive revenue surplus. Client-count surplus pays
 * nothing (it is surfaced elsewhere as a display-only stat).
 *
 * @param {object} input
 * @param {string|number} input.revenueTarget
 * @param {string|number} input.achievedAmount
 * @param {string|number} input.monthlySalary
 * @param {object} [config] incentive config (see DEFAULT_INCENTIVE_CONFIG)
 * @returns {{ surplusPct:number, incentiveAmount:number, hasRevenueSurplus:boolean }}
 */
function computeIncentive(input, config = DEFAULT_INCENTIVE_CONFIG) {
  const cfg = { ...DEFAULT_INCENTIVE_CONFIG, ...config };

  const revenueTargetPaise = toPaise(input.revenueTarget);
  const achievedPaise = toPaise(input.achievedAmount);
  const salaryPaise = toPaise(input.monthlySalary);

  // Guard: a zero revenue target cannot produce a percentage surplus.
  if (revenueTargetPaise === 0) {
    return { surplusPct: 0, incentiveAmount: 0, hasRevenueSurplus: false };
  }

  const surplusPaise = achievedPaise - revenueTargetPaise;
  const hasRevenueSurplus = surplusPaise > 0;

  if (!hasRevenueSurplus) {
    // No revenue surplus -> no incentive, regardless of client-count surplus.
    return { surplusPct: 0, incentiveAmount: 0, hasRevenueSurplus: false };
  }

  // surplus_pct as a true percentage (e.g. 20 for 20%).
  const surplusPct = round2((surplusPaise / revenueTargetPaise) * 100);

  // incentive = (surplus_pct/100) * salary * multiplier
  const effectivePct = surplusPct * cfg.multiplier;
  let incentivePaise = Math.round((effectivePct / 100) * salaryPaise);

  if (cfg.capEnabled && cfg.maxIncentiveAmount !== null && cfg.maxIncentiveAmount !== undefined) {
    const capPaise = toPaise(cfg.maxIncentiveAmount);
    if (incentivePaise > capPaise) incentivePaise = capPaise;
  }

  return {
    surplusPct,
    incentiveAmount: fromPaise(incentivePaise),
    hasRevenueSurplus: true,
  };
}

/**
 * Compute a TIERED (slab-based) incentive on the revenue surplus.
 *
 * The surplus (achieved - target, only the part above target) is split across
 * ordered slabs. Each slab applies its own percentage to the portion of surplus
 * that falls within it, and the results are summed (cumulative).
 *
 * Slabs are fully HR-configured (ranges + percentages). Beyond the last slab's
 * upper bound, nothing is paid (0%) — HR can add a final open-ended slab if they
 * want a rate to continue indefinitely.
 *
 * Worked example (HR's): target 100000, achieved 250000 -> surplus 150000
 *   tiers: [{from:0,to:100000,percent:5}, {from:100000,to:200000,percent:3}]
 *   slab1: 100000 * 5% = 5000
 *   slab2:  50000 * 3% = 1500
 *   total = 6500
 *
 * @param {object} input
 * @param {string|number} input.revenueTarget
 * @param {string|number} input.achievedAmount
 * @param {Array<{from:number,to:number|null,percent:number}>} tiers
 *        `from`/`to` are surplus-amount boundaries in rupees (to=null => open).
 *        Slabs are sorted by `from` ascending before applying.
 * @returns {{
 *   incentiveAmount:number, surplus:number, hasRevenueSurplus:boolean,
 *   breakdown:Array<{from:number,to:number|null,percent:number,amountInSlab:number,incentive:number}>
 * }}
 */
function computeTieredIncentive(input, tiers) {
  const targetPaise = toPaise(input.revenueTarget ?? 0);
  const achievedPaise = toPaise(input.achievedAmount ?? 0);

  const surplusPaise = achievedPaise - targetPaise;
  // Incentive is paid ONLY after the target is met, and only on the surplus.
  if (targetPaise === 0 || surplusPaise <= 0 || !Array.isArray(tiers) || tiers.length === 0) {
    return { incentiveAmount: 0, surplus: fromPaise(Math.max(0, surplusPaise)), hasRevenueSurplus: surplusPaise > 0, breakdown: [] };
  }

  // Normalise + sort slabs by their lower bound.
  const slabs = tiers
    .map((t) => ({
      fromPaise: toPaise(t.from ?? 0),
      toPaise: t.to === null || t.to === undefined || t.to === '' ? null : toPaise(t.to),
      percent: Number(t.percent) || 0,
    }))
    .sort((a, b) => a.fromPaise - b.fromPaise);

  let incentivePaise = 0;
  const breakdown = [];

  for (const slab of slabs) {
    // The portion of the surplus that lies within [from, to).
    const lower = slab.fromPaise;
    const upper = slab.toPaise === null ? surplusPaise : Math.min(slab.toPaise, surplusPaise);
    const amountInSlabPaise = Math.max(0, upper - lower);
    if (amountInSlabPaise <= 0) continue;

    const slabIncentivePaise = Math.round((slab.percent / 100) * amountInSlabPaise);
    incentivePaise += slabIncentivePaise;

    breakdown.push({
      from: fromPaise(slab.fromPaise),
      to: slab.toPaise === null ? null : fromPaise(slab.toPaise),
      percent: slab.percent,
      amountInSlab: fromPaise(amountInSlabPaise),
      incentive: fromPaise(slabIncentivePaise),
    });
  }

  return {
    incentiveAmount: fromPaise(incentivePaise),
    surplus: fromPaise(surplusPaise),
    hasRevenueSurplus: true,
    breakdown,
  };
}

/**
 * Validate a set of HR-configured tiers. Returns { valid, errors }.
 * Rules: 1-5 slabs; non-negative ranges; each `to` > its `from`; slabs must be
 * contiguous and non-overlapping (next.from === prev.to); only the LAST slab may
 * be open-ended (to = null); percentages between 0 and 100.
 */
function validateTiers(tiers) {
  const errors = [];
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return { valid: false, errors: ['At least one slab is required'] };
  }
  if (tiers.length > 5) errors.push('A maximum of 5 slabs is allowed');

  const sorted = [...tiers].sort((a, b) => (Number(a.from) || 0) - (Number(b.from) || 0));
  for (let i = 0; i < sorted.length; i += 1) {
    const t = sorted[i];
    const from = Number(t.from);
    const isLast = i === sorted.length - 1;
    const to = t.to === null || t.to === undefined || t.to === '' ? null : Number(t.to);
    const pct = Number(t.percent);

    if (!Number.isFinite(from) || from < 0) errors.push(`Slab ${i + 1}: "from" must be 0 or more`);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) errors.push(`Slab ${i + 1}: percent must be between 0 and 100`);
    if (to !== null) {
      if (!Number.isFinite(to)) errors.push(`Slab ${i + 1}: "to" is invalid`);
      else if (to <= from) errors.push(`Slab ${i + 1}: "to" must be greater than "from"`);
    } else if (!isLast) {
      errors.push(`Only the last slab may be open-ended (blank "to")`);
    }
    // Contiguity: each slab must start where the previous ended.
    if (i > 0) {
      const prevTo = sorted[i - 1].to === null || sorted[i - 1].to === undefined || sorted[i - 1].to === ''
        ? null : Number(sorted[i - 1].to);
      if (prevTo === null) errors.push('An open-ended slab must be the last one');
      else if (Number(from) !== prevTo) errors.push(`Slab ${i + 1}: "from" (${from}) must equal previous slab's "to" (${prevTo})`);
    } else if (from !== 0) {
      errors.push('The first slab must start "from" 0');
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Default example tiers seeded on first run (HR edits these to real values). */
const DEFAULT_TIERS = Object.freeze([
  { from: 0, to: 100000, percent: 5 },
  { from: 100000, to: 200000, percent: 3 },
]);

/**
 * Evaluate the "Either One" monthly achievement rule.
 *
 * A month is Achieved if the rep hits AT LEAST ONE of:
 *   - client-count target (achievedClients >= clientTarget)
 *   - revenue target       (achievedAmount  >= revenueTarget)
 *
 * @param {object} input
 * @param {number} input.clientTarget
 * @param {number} input.achievedClients
 * @param {string|number} input.revenueTarget
 * @param {string|number} input.achievedAmount
 * @returns {{
 *   achieved:boolean, status:'achieved'|'pending',
 *   clientMet:boolean, revenueMet:boolean,
 *   clientPct:number, revenuePct:number,
 *   remainingClients:number, remainingRevenue:number,
 *   clientSurplus:number, revenueSurplus:number
 * }}
 */
function evaluateEitherOne(input) {
  const clientTarget = Number(input.clientTarget) || 0;
  const achievedClients = Number(input.achievedClients) || 0;
  const revenueTargetPaise = toPaise(input.revenueTarget ?? 0);
  const achievedPaise = toPaise(input.achievedAmount ?? 0);

  const clientMet = clientTarget > 0 ? achievedClients >= clientTarget : false;
  const revenueMet = revenueTargetPaise > 0 ? achievedPaise >= revenueTargetPaise : false;

  const achieved = clientMet || revenueMet;

  const clientPct = clientTarget > 0 ? round2((achievedClients / clientTarget) * 100) : 0;
  const revenuePct = revenueTargetPaise > 0
    ? round2((achievedPaise / revenueTargetPaise) * 100)
    : 0;

  return {
    achieved,
    status: achieved ? 'achieved' : 'pending',
    clientMet,
    revenueMet,
    clientPct,
    revenuePct,
    remainingClients: Math.max(0, clientTarget - achievedClients),
    remainingRevenue: fromPaise(Math.max(0, revenueTargetPaise - achievedPaise)),
    clientSurplus: Math.max(0, achievedClients - clientTarget),
    revenueSurplus: fromPaise(Math.max(0, achievedPaise - revenueTargetPaise)),
  };
}

module.exports = {
  toPaise,
  fromPaise,
  round2,
  DEFAULT_INCENTIVE_CONFIG,
  computeIncentive,
  computeTieredIncentive,
  validateTiers,
  DEFAULT_TIERS,
  evaluateEitherOne,
};
