'use strict';

/**
 * Seed: one admin + two reps, with targets, salaries, sample sales, clients,
 * a completed work session with pings, and verified visits — so the app is
 * demonstrable immediately. Idempotent: truncates then re-inserts.
 *
 * All seeded users get the same default password (DEFAULT_SEED_PASSWORD) so you
 * can log in during testing. CHANGE IT after first login. Documented in README.
 */

const bcrypt = require('bcryptjs');
const config = require('../../config');

const DEFAULT_SEED_PASSWORD = 'ChangeMe@123';

function monthKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

exports.seed = async function seed(knex) {
  // Pre-hash the shared default password once (bcrypt).
  const passwordHash = bcrypt.hashSync(DEFAULT_SEED_PASSWORD, config.auth.bcryptRounds);
  const now = new Date();
  const month = monthKey(now); // current month, e.g. 2026-05
  const dayStr = (n) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), n));
    return d.toISOString().slice(0, 10);
  };

  // Clear in FK-safe order.
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  for (const tbl of [
    'export_logs', 'incentives', 'visit_photos', 'visits', 'location_pings',
    'work_sessions', 'sales_entries', 'clients', 'salaries', 'targets', 'users',
  ]) {
    await knex(tbl).truncate();
  }
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');

  // --- Users (all share DEFAULT_SEED_PASSWORD; see README) ---
  const [adminId] = await knex('users').insert({
    name: 'Asha Admin', email: 'admin@ara.test', phone: '9000000001', role: 'admin', password_hash: passwordHash,
  });
  const [rep1Id] = await knex('users').insert({
    name: 'Ravi Rep', email: 'ravi@ara.test', phone: '9000000002', role: 'rep', password_hash: passwordHash,
  });
  const [rep2Id] = await knex('users').insert({
    name: 'Meena Rep', email: 'meena@ara.test', phone: '9000000003', role: 'rep', password_hash: passwordHash,
  });

  // --- Targets (per rep, current month) ---
  await knex('targets').insert([
    { rep_id: rep1Id, month, client_target: 10, revenue_target: '100000.00' },
    { rep_id: rep2Id, month, client_target: 8, revenue_target: '80000.00' },
  ]);

  // --- Salaries (admin-only data) ---
  await knex('salaries').insert([
    { rep_id: rep1Id, month, monthly_salary: '20000.00' },
    { rep_id: rep2Id, month, monthly_salary: '18000.00' },
  ]);

  // --- Clients (with reference points around Bengaluru) ---
  const [c1] = await knex('clients').insert({
    name: 'Greenwood High School', reference_lat: '12.9716000', reference_lng: '77.5946000', created_by_rep_id: rep1Id,
  });
  const [c2] = await knex('clients').insert({
    name: 'Sunrise Public School', reference_lat: '12.9352000', reference_lng: '77.6245000', created_by_rep_id: rep1Id,
  });
  const [c3] = await knex('clients').insert({
    name: 'Blue Bells Academy', reference_lat: '12.9279000', reference_lng: '77.6271000', created_by_rep_id: rep2Id,
  });

  // --- Sales entries (Ravi exceeds revenue target -> incentive; Meena below) ---
  await knex('sales_entries').insert([
    { rep_id: rep1Id, client_id: c1, client_name: 'Greenwood High School', product: 'schoolmate', lead_type: 'hot', amount: '45000.00', sale_date: dayStr(3), notes: 'Bulk order' },
    { rep_id: rep1Id, client_id: c2, client_name: 'Sunrise Public School', product: 'school_dm', lead_type: 'warm', amount: '40000.00', sale_date: dayStr(7), notes: null },
    { rep_id: rep1Id, client_id: null, client_name: 'Walk-in enquiry', product: 'general_dm', lead_type: 'cold', amount: '35000.00', sale_date: dayStr(12), notes: 'New lead' },
    { rep_id: rep2Id, client_id: c3, client_name: 'Blue Bells Academy', product: 'both', lead_type: 'hot', amount: '30000.00', sale_date: dayStr(5), notes: null },
    { rep_id: rep2Id, client_id: null, client_name: 'Tiny Tots Play School', product: 'schoolmate', lead_type: 'warm', amount: '20000.00', sale_date: dayStr(9), notes: null },
  ]);
  // Ravi: 120000 achieved vs 100000 target -> 20% surplus -> incentive 4000 (salary 20000)
  // Meena: 50000 achieved vs 80000 target -> no surplus -> no incentive

  // --- Work session + pings (a completed trip for Ravi) ---
  const startedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 12, 9, 0, 0));
  const endedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 12, 11, 0, 0));
  const [sessionId] = await knex('work_sessions').insert({
    rep_id: rep1Id, started_at: startedAt, ended_at: endedAt,
  });
  const route = [
    [12.9716, 77.5946], [12.9700, 77.6000], [12.9600, 77.6100],
    [12.9450, 77.6200], [12.9352, 77.6245],
  ];
  let t = startedAt.getTime();
  const pings = route.map(([lat, lng]) => {
    const recorded = new Date(t);
    t += 5 * 60 * 1000; // +5 min
    return { session_id: sessionId, rep_id: rep1Id, lat: lat.toFixed(7), lng: lng.toFixed(7), recorded_at: recorded };
  });
  await knex('location_pings').insert(pings);

  // --- Visits (one pass, one flagged) with photos ---
  const issued = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 12, 9, 5, 0));
  const [visitPassId] = await knex('visits').insert({
    rep_id: rep1Id, client_id: c1, visit_code: '482913',
    code_issued_at: issued, code_expires_at: new Date(issued.getTime() + 90000), code_used: true,
    capture_lat: '12.9716500', capture_lng: '77.5946500',
    server_timestamp: new Date(issued.getTime() + 30000),
    geofence_pass: true, mock_location_flag: false, status: 'pass',
  });
  await knex('visit_photos').insert({ visit_id: visitPassId, file_path: 'uploads/sample/visit_pass.jpg' });

  const issued2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 12, 10, 55, 0));
  const [visitFlagId] = await knex('visits').insert({
    rep_id: rep1Id, client_id: c2, visit_code: '729104',
    code_issued_at: issued2, code_expires_at: new Date(issued2.getTime() + 90000), code_used: true,
    capture_lat: '12.9400000', capture_lng: '77.6300000', // ~700m off -> flagged
    server_timestamp: new Date(issued2.getTime() + 20000),
    geofence_pass: false, mock_location_flag: false, status: 'flag',
  });
  await knex('visit_photos').insert({ visit_id: visitFlagId, file_path: 'uploads/sample/visit_flag.jpg' });

  // --- Incentive snapshot for Ravi (computed example) ---
  await knex('incentives').insert({
    rep_id: rep1Id, month, revenue_target: '100000.00', achieved_amount: '120000.00',
    surplus_pct: '20.00', monthly_salary: '20000.00', incentive_amount: '4000.00',
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded: admin=${adminId}, reps=[${rep1Id},${rep2Id}], month=${month}`);
};
