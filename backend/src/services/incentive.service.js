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
  evaluateEitherOne,
};
