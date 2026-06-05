'use strict';

/**
 * Excel export (admin, one click). Produces a single workbook with five sheets:
 *   1. Sales Entries
 *   2. Target vs Achievement (with % and surplus)
 *   3. Incentives
 *   4. Visit Log (time, location, photo link, pass/flag status)
 *   5. Movement Summary (per work session / route)
 */

const ExcelJS = require('exceljs');
const db = require('../db/knex');
const { storage } = require('../storage');
const { adminOverview } = require('./dashboard.service');

function money(v) {
  return Number(v || 0);
}

async function buildWorkbook(month) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ara Sales';
  wb.created = new Date();

  // --- Sheet 1: Sales Entries ---
  const s1 = wb.addWorksheet('Sales Entries');
  const LEAD_MODE_LABELS = {
    platform: 'Platform',
    specific_dm: 'Specific Digital Marketing',
    general_dm: 'General Digital Marketing',
    direct_visit: 'Direct Visit',
  };
  s1.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Rep', key: 'rep', width: 18 },
    { header: 'Client', key: 'client_name', width: 24 },
    { header: 'Product', key: 'product', width: 16 },
    { header: 'Lead Mode', key: 'lead_mode', width: 24 },
    { header: 'Lead Type', key: 'lead_type', width: 12 },
    { header: 'Amount (₹)', key: 'amount', width: 14 },
    { header: 'Sale Date', key: 'sale_date', width: 14 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  const sales = await db('sales_entries as se')
    .join('users as u', 'u.id', 'se.rep_id')
    .whereRaw("DATE_FORMAT(se.sale_date, '%Y-%m') = ?", [month])
    .select('se.id', 'u.name as rep', 'se.client_name', 'se.product', 'se.lead_mode', 'se.lead_type', 'se.amount', 'se.sale_date', 'se.notes')
    .orderBy('se.sale_date');
  sales.forEach((r) => s1.addRow({
    ...r,
    lead_mode: LEAD_MODE_LABELS[r.lead_mode] || r.lead_mode || '',
    amount: money(r.amount),
  }));

  // --- Sheet 2: Target vs Achievement ---
  const s2 = wb.addWorksheet('Target vs Achievement');
  s2.columns = [
    { header: 'Rep', key: 'name', width: 18 },
    { header: 'Client Target', key: 'clientTarget', width: 14 },
    { header: 'Clients Achieved', key: 'achievedClients', width: 16 },
    { header: 'Client %', key: 'clientPct', width: 10 },
    { header: 'Revenue Target (₹)', key: 'revenueTarget', width: 18 },
    { header: 'Revenue Achieved (₹)', key: 'achievedAmount', width: 20 },
    { header: 'Revenue %', key: 'revenuePct', width: 10 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Client Surplus', key: 'clientSurplus', width: 14 },
    { header: 'Revenue Surplus (₹)', key: 'revenueSurplus', width: 18 },
  ];
  const overview = await adminOverview(month);
  overview.forEach((o) => s2.addRow(o));

  // --- Sheet 3: Incentives ---
  const s3 = wb.addWorksheet('Incentives');
  s3.columns = [
    { header: 'Rep', key: 'name', width: 18 },
    { header: 'Revenue Target (₹)', key: 'revenueTarget', width: 18 },
    { header: 'Achieved (₹)', key: 'achievedAmount', width: 16 },
    { header: 'Surplus %', key: 'surplusPct', width: 12 },
    { header: 'Monthly Salary (₹)', key: 'monthlySalary', width: 18 },
    { header: 'Incentive (₹)', key: 'incentiveAmount', width: 16 },
  ];
  overview.forEach((o) => s3.addRow({
    name: o.name,
    revenueTarget: o.revenueTarget,
    achievedAmount: o.achievedAmount,
    surplusPct: o.surplusPct,
    monthlySalary: o.monthlySalary,
    incentiveAmount: o.incentiveAmount,
  }));

  // --- Sheet 4: Visit Log ---
  const s4 = wb.addWorksheet('Visit Log');
  s4.columns = [
    { header: 'Visit ID', key: 'id', width: 10 },
    { header: 'Rep', key: 'rep', width: 18 },
    { header: 'Client', key: 'client', width: 24 },
    { header: 'Server Time', key: 'server_timestamp', width: 22 },
    { header: 'Lat', key: 'capture_lat', width: 14 },
    { header: 'Lng', key: 'capture_lng', width: 14 },
    { header: 'Geofence', key: 'geofence', width: 12 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Photo Link', key: 'photo', width: 50 },
  ];
  const visits = await db('visits as v')
    .join('users as u', 'u.id', 'v.rep_id')
    .leftJoin('clients as c', 'c.id', 'v.client_id')
    .leftJoin('visit_photos as p', 'p.visit_id', 'v.id')
    .whereRaw("DATE_FORMAT(v.created_at, '%Y-%m') = ?", [month])
    .select(
      'v.id', 'u.name as rep', 'c.name as client', 'v.server_timestamp',
      'v.capture_lat', 'v.capture_lng', 'v.geofence_pass',
      'v.status', 'p.file_path',
    )
    .orderBy('v.created_at');
  visits.forEach((v) => s4.addRow({
    id: v.id,
    rep: v.rep,
    client: v.client,
    server_timestamp: v.server_timestamp,
    capture_lat: v.capture_lat,
    capture_lng: v.capture_lng,
    geofence: v.geofence_pass ? 'PASS' : 'FAIL',
    status: (v.status || '').toUpperCase(),
    photo: v.file_path ? storage.publicUrl(v.file_path) : '',
  }));

  // --- Sheet 5: Movement Summary ---
  const s5 = wb.addWorksheet('Movement Summary');
  s5.columns = [
    { header: 'Session ID', key: 'id', width: 12 },
    { header: 'Rep', key: 'rep', width: 18 },
    { header: 'Started', key: 'started_at', width: 22 },
    { header: 'Ended', key: 'ended_at', width: 22 },
    { header: 'Pings', key: 'pings', width: 10 },
    { header: 'Duration (min)', key: 'duration', width: 16 },
  ];
  const sessions = await db('work_sessions as ws')
    .join('users as u', 'u.id', 'ws.rep_id')
    .whereRaw("DATE_FORMAT(ws.started_at, '%Y-%m') = ?", [month])
    .select('ws.id', 'u.name as rep', 'ws.started_at', 'ws.ended_at')
    .orderBy('ws.started_at');
  for (const ws of sessions) {
    const cnt = await db('location_pings').where('session_id', ws.id).count({ c: '*' }).first();
    const duration = ws.ended_at
      ? Math.round((new Date(ws.ended_at) - new Date(ws.started_at)) / 60000)
      : null;
    s5.addRow({ id: ws.id, rep: ws.rep, started_at: ws.started_at, ended_at: ws.ended_at, pings: Number(cnt.c), duration });
  }

  // --- Sheet 6: Travel Distance (KM per rep per day) ---
  const s6 = wb.addWorksheet('Travel Distance');
  s6.columns = [
    { header: 'Rep', key: 'rep', width: 18 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Distance (km)', key: 'km', width: 16 },
    { header: 'Allowance (₹)', key: 'allowance', width: 16 },
  ];
  // eslint-disable-next-line global-require
  const distance = require('./distance.service');
  const rateRow = await db('app_settings').where({ key: 'allowance_per_km' }).first();
  const rate = rateRow ? Number(rateRow.value) || 0 : 0;
  const distRows = await distance.allRepsDailyDistance(month);
  distRows.forEach((r) => s6.addRow({
    rep: r.rep, date: r.date, km: r.km, allowance: Math.round(r.km * rate * 100) / 100,
  }));

  // Bold headers on every sheet.
  [s1, s2, s3, s4, s5, s6].forEach((ws) => { ws.getRow(1).font = { bold: true }; });

  return wb;
}

module.exports = { buildWorkbook };
