'use strict';

/**
 * Daily travel distance per rep, computed from location_pings.
 *
 * For each rep+day we walk the pings in time order and sum the great-circle
 * (Haversine) distance between consecutive points. Returns kilometres.
 */

const db = require('../db/knex');
const { haversineMeters } = require('./visit.service');

/**
 * Distance (km) a rep travelled on each day in a month.
 * @param {number} repId
 * @param {string} month YYYY-MM
 * @returns {Promise<Array<{date:string, km:number, points:number}>>}
 */
async function dailyDistanceForRep(repId, month) {
  const pings = await db('location_pings')
    .where('rep_id', repId)
    .andWhereRaw("DATE_FORMAT(recorded_at, '%Y-%m') = ?", [month])
    .orderBy('recorded_at')
    .select('lat', 'lng', 'recorded_at');

  const byDay = new Map();
  for (const p of pings) {
    const day = String(p.recorded_at instanceof Date ? p.recorded_at.toISOString() : p.recorded_at).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({ lat: Number(p.lat), lng: Number(p.lng) });
  }

  const out = [];
  for (const [date, pts] of byDay) {
    let meters = 0;
    for (let i = 1; i < pts.length; i += 1) {
      meters += haversineMeters(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    }
    out.push({ date, km: Math.round((meters / 1000) * 100) / 100, points: pts.length });
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

/** Total km a rep travelled across a month. */
async function monthlyDistanceForRep(repId, month) {
  const days = await dailyDistanceForRep(repId, month);
  const totalKm = Math.round(days.reduce((s, d) => s + d.km, 0) * 100) / 100;
  return { totalKm, days };
}

/** Per-day distance for ALL reps in a month (used by the Excel export). */
async function allRepsDailyDistance(month) {
  const reps = await db('users').where({ role: 'rep' }).select('id', 'name');
  const rows = [];
  for (const rep of reps) {
    const days = await dailyDistanceForRep(rep.id, month);
    for (const d of days) rows.push({ repId: rep.id, rep: rep.name, date: d.date, km: d.km });
  }
  rows.sort((a, b) => a.rep.localeCompare(b.rep) || a.date.localeCompare(b.date));
  return rows;
}

module.exports = { dailyDistanceForRep, monthlyDistanceForRep, allRepsDailyDistance };
