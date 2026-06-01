'use strict';

/**
 * Dashboard aggregations shared by admin overview and rep dashboard.
 * Money is summed in SQL but returned as strings/numbers and re-evaluated with
 * the pure incentive service so the math stays in one tested place.
 */

const db = require('../db/knex');
const { evaluateEitherOne, computeIncentive } = require('./incentive.service');
const config = require('../config');
const { monthKey } = require('../utils/time');

function incentiveConfig() {
  return {
    multiplier: config.incentive.multiplier,
    capEnabled: config.incentive.capEnabled,
    maxIncentiveAmount: config.incentive.maxIncentiveAmount,
  };
}

/** Sum achieved revenue + distinct client count for a rep in a month. */
async function achievementFor(repId, month) {
  // Sales whose sale_date falls in `month`.
  const rows = await db('sales_entries')
    .where('rep_id', repId)
    .andWhereRaw("DATE_FORMAT(sale_date, '%Y-%m') = ?", [month]);

  let achievedPaise = 0;
  const clientKeys = new Set();
  const byProduct = {};
  const byLeadType = { hot: 0, warm: 0, cold: 0 };

  for (const r of rows) {
    achievedPaise += Math.round(Number(r.amount) * 100);
    // A "client onboarded" = a distinct client (by id, else by name).
    clientKeys.add(r.client_id != null ? `id:${r.client_id}` : `name:${r.client_name}`);
    byProduct[r.product] = (byProduct[r.product] || 0) + 1;
    if (byLeadType[r.lead_type] !== undefined) byLeadType[r.lead_type] += 1;
  }

  return {
    achievedAmount: achievedPaise / 100,
    achievedClients: clientKeys.size,
    byProduct,
    byLeadType,
    salesCount: rows.length,
  };
}

/**
 * Full month summary for one rep. `includeSalary` controls whether salary +
 * incentive internals are exposed. Rep-facing callers MUST pass false; only the
 * resulting incentive amount (when there is a surplus) is included for reps.
 */
async function repMonthSummary(repId, month, { includeSalary }) {
  const target = await db('targets').where({ rep_id: repId, month }).first();
  const salaryRow = await db('salaries').where({ rep_id: repId, month }).first();

  const clientTarget = target ? Number(target.client_target) : 0;
  const revenueTarget = target ? target.revenue_target : '0';
  const monthlySalary = salaryRow ? salaryRow.monthly_salary : '0';

  const ach = await achievementFor(repId, month);

  const either = evaluateEitherOne({
    clientTarget,
    achievedClients: ach.achievedClients,
    revenueTarget,
    achievedAmount: ach.achievedAmount,
  });

  const inc = computeIncentive(
    { revenueTarget, achievedAmount: ach.achievedAmount, monthlySalary },
    incentiveConfig(),
  );

  const base = {
    repId,
    month,
    clientTarget,
    revenueTarget: Number(revenueTarget),
    achievedClients: ach.achievedClients,
    achievedAmount: ach.achievedAmount,
    clientPct: either.clientPct,
    revenuePct: either.revenuePct,
    status: either.status,
    achieved: either.achieved,
    clientMet: either.clientMet,
    revenueMet: either.revenueMet,
    remainingClients: either.remainingClients,
    remainingRevenue: either.remainingRevenue,
    clientSurplus: either.clientSurplus,
    revenueSurplus: either.revenueSurplus,
    byProduct: ach.byProduct,
    byLeadType: ach.byLeadType,
    salesCount: ach.salesCount,
    // Incentive is shown to reps ONLY when there is a revenue surplus.
    incentiveAmount: inc.hasRevenueSurplus ? inc.incentiveAmount : 0,
    surplusPct: inc.surplusPct,
  };

  if (includeSalary) {
    // Admin-only fields. NEVER return these to a rep.
    base.monthlySalary = Number(monthlySalary);
  }
  return base;
}

/** Admin overview: all reps for a month. Includes salary/incentive internals. */
async function adminOverview(month) {
  const reps = await db('users').where({ role: 'rep' }).select('id', 'name', 'email');
  const out = [];
  for (const rep of reps) {
    const summary = await repMonthSummary(rep.id, month, { includeSalary: true });
    out.push({ name: rep.name, email: rep.email, ...summary });
  }
  return out;
}

/**
 * Persist the incentive snapshot for a rep/month (idempotent upsert).
 * Returns the stored row.
 */
async function recomputeAndStoreIncentive(repId, month) {
  const summary = await repMonthSummary(repId, month, { includeSalary: true });
  const row = {
    rep_id: repId,
    month,
    revenue_target: summary.revenueTarget.toFixed(2),
    achieved_amount: summary.achievedAmount.toFixed(2),
    surplus_pct: summary.surplusPct.toFixed(2),
    monthly_salary: (summary.monthlySalary || 0).toFixed(2),
    incentive_amount: summary.incentiveAmount.toFixed(2),
  };
  const existing = await db('incentives').where({ rep_id: repId, month }).first();
  if (existing) {
    await db('incentives').where({ id: existing.id }).update(row);
  } else {
    await db('incentives').insert(row);
  }
  return row;
}

module.exports = {
  achievementFor,
  repMonthSummary,
  adminOverview,
  recomputeAndStoreIncentive,
  currentMonth: () => monthKey(new Date()),
};
