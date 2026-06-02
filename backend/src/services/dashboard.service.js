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

/**
 * Analytics for charts (admin web + mobile rep). Returns totals, breakdowns
 * (by product, lead type, per rep) and a daily trend, honouring filters.
 *
 * @param {object} f
 * @param {string} f.month        YYYY-MM
 * @param {number} [f.repId]      restrict to one rep (rep dashboard always sets this)
 * @param {string} [f.product]
 * @param {string} [f.leadType]
 */
async function analytics(f) {
  const month = f.month;
  const q = db('sales_entries as se').whereRaw("DATE_FORMAT(se.sale_date, '%Y-%m') = ?", [month]);
  if (f.repId) q.andWhere('se.rep_id', f.repId);
  if (f.product) q.andWhere('se.product', f.product);
  if (f.leadType) q.andWhere('se.lead_type', f.leadType);

  const rows = await q.join('users as u', 'u.id', 'se.rep_id')
    .select('se.amount', 'se.product', 'se.lead_type', 'se.sale_date', 'se.rep_id', 'u.name as rep_name');

  let totalPaise = 0;
  const byProduct = {};
  const byLeadType = { hot: 0, warm: 0, cold: 0 };
  const byProductAmt = {};
  const byRep = {};
  const byDay = {};

  for (const r of rows) {
    const paise = Math.round(Number(r.amount) * 100);
    totalPaise += paise;
    byProduct[r.product] = (byProduct[r.product] || 0) + 1;
    byProductAmt[r.product] = (byProductAmt[r.product] || 0) + paise;
    if (byLeadType[r.lead_type] !== undefined) byLeadType[r.lead_type] += 1;
    if (!byRep[r.rep_id]) byRep[r.rep_id] = { repId: r.rep_id, name: r.rep_name, amount: 0, count: 0 };
    byRep[r.rep_id].amount += paise;
    byRep[r.rep_id].count += 1;
    const day = String(r.sale_date).slice(0, 10);
    byDay[day] = (byDay[day] || 0) + paise;
  }

  const toRupees = (p) => Math.round(p) / 100;
  const trend = Object.keys(byDay).sort().map((d) => ({ date: d, amount: toRupees(byDay[d]) }));

  return {
    month,
    totals: { revenue: toRupees(totalPaise), salesCount: rows.length },
    byProductCount: byProduct,
    byProductAmount: Object.fromEntries(Object.entries(byProductAmt).map(([k, v]) => [k, toRupees(v)])),
    byLeadType,
    byRep: Object.values(byRep)
      .map((r) => ({ ...r, amount: toRupees(r.amount) }))
      .sort((a, b) => b.amount - a.amount),
    trend,
  };
}

module.exports = {
  achievementFor,
  repMonthSummary,
  adminOverview,
  recomputeAndStoreIncentive,
  analytics,
  currentMonth: () => monthKey(new Date()),
};
