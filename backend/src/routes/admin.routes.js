'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/error');
const { authenticate, requireRole } = require('../middleware/auth');
const db = require('../db/knex');
const dashboard = require('../services/dashboard.service');
const authService = require('../services/auth.service');
const audit = require('../services/audit.service');
const { buildWorkbook } = require('../services/export.service');
const { purgeOldPhotos } = require('../services/retention.service');
const { storage } = require('../storage');
const config = require('../config');

const router = express.Router();

// Every admin route requires a valid token AND the admin role (server-side).
router.use(authenticate, requireRole('admin'));

const monthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
const monthParam = (req) => req.query.month || dashboard.currentMonth();

// --- Reps list (active only, for dropdowns) ---
router.get('/reps', asyncHandler(async (req, res) => {
  const reps = await db('users').where({ role: 'rep', active: true }).select('id', 'name', 'email', 'phone');
  res.json({ reps });
}));

// --- List all users (admin-only), with optional search + role/active filters ---
const usersFilterSchema = z.object({
  q: z.string().max(120).optional(),
  role: z.enum(['admin', 'rep']).optional(),
  active: z.enum(['true', 'false']).optional(),
});
router.get('/users', validate({ query: usersFilterSchema }), asyncHandler(async (req, res) => {
  const qb = db('users').select('id', 'name', 'email', 'phone', 'role', 'active', 'created_at').orderBy('id');
  if (req.query.role) qb.where('role', req.query.role);
  if (req.query.active) qb.where('active', req.query.active === 'true');
  if (req.query.q) {
    const like = `%${req.query.q}%`;
    qb.andWhere((b) => b.where('name', 'like', like).orWhere('email', 'like', like));
  }
  const users = await qb;
  res.json({ users });
}));

// --- Create a user (rep or admin) with an optional initial password ---
const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  role: z.enum(['admin', 'rep']).default('rep'),
  password: z.string().min(config.auth.minPasswordLength).optional(),
});
router.post('/users', validate({ body: createUserSchema }), asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const exists = await db('users').where({ email }).first();
  if (exists) throw ApiError.conflict('A user with that email already exists');

  const password_hash = req.body.password
    ? await authService.hashPassword(req.body.password)
    : null;
  const [id] = await db('users').insert({
    name: req.body.name,
    email,
    phone: req.body.phone || null,
    role: req.body.role,
    password_hash,
  });
  await audit.record(req.user, 'user.create', { targetType: 'user', targetId: id, detail: { email, role: req.body.role } });
  res.status(201).json({ ok: true, id });
}));

// --- Edit a user; may change email, role, active state, set/replace password ---
const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  role: z.enum(['admin', 'rep']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(config.auth.minPasswordLength).optional(),
});
const userIdParam = z.object({ id: z.coerce.number().int().positive() });
router.put('/users/:id', validate({ params: userIdParam, body: updateUserSchema }), asyncHandler(async (req, res) => {
  const user = await db('users').where({ id: req.params.id }).first();
  if (!user) throw ApiError.notFound('User not found');

  // Guard: don't let an admin deactivate or demote their own account (lockout).
  if (req.params.id === req.user.id) {
    if (req.body.active === false) throw ApiError.badRequest('You cannot deactivate your own account');
    if (req.body.role && req.body.role !== 'admin') throw ApiError.badRequest('You cannot change your own role');
  }

  const patch = {};
  if (req.body.name !== undefined) patch.name = req.body.name;
  if (req.body.phone !== undefined) patch.phone = req.body.phone;
  if (req.body.role !== undefined) patch.role = req.body.role;
  if (req.body.active !== undefined) patch.active = req.body.active;
  if (req.body.email !== undefined) {
    const newEmail = req.body.email.toLowerCase();
    if (newEmail !== user.email) {
      const taken = await db('users').where({ email: newEmail }).whereNot({ id: user.id }).first();
      if (taken) throw ApiError.conflict('A user with that email already exists');
      patch.email = newEmail;
    }
  }
  if (req.body.password !== undefined) {
    patch.password_hash = await authService.hashPassword(req.body.password);
  }
  if (Object.keys(patch).length) await db('users').where({ id: user.id }).update(patch);

  const action = req.body.active === false ? 'user.deactivate'
    : req.body.active === true ? 'user.activate' : 'user.update';
  await audit.record(req.user, action, {
    targetType: 'user',
    targetId: user.id,
    detail: { changed: Object.keys(patch), passwordReset: req.body.password !== undefined },
  });
  res.json({ ok: true });
}));

// --- Delete a user permanently (admin-only). Cannot delete yourself. ---
// NOTE: cascades remove the user's sales/visits/route history. Prefer deactivate.
router.delete('/users/:id', validate({ params: userIdParam }), asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) throw ApiError.badRequest('You cannot delete your own account');
  const user = await db('users').where({ id }).first();
  if (!user) throw ApiError.notFound('User not found');
  await db('users').where({ id }).del(); // FK cascades remove their related rows
  await audit.record(req.user, 'user.delete', { targetType: 'user', targetId: id, detail: { email: user.email } });
  res.json({ ok: true, deleted: { id, email: user.email } });
}));

// --- Audit log (admin-only) ---
router.get('/audit', asyncHandler(async (req, res) => {
  res.json({ entries: await audit.recent(150) });
}));

// --- Overview: all reps target vs achieved, %, status, surplus, incentive ---
router.get('/overview', validate({ query: monthSchema }), asyncHandler(async (req, res) => {
  const month = monthParam(req);
  const overview = await dashboard.adminOverview(month);
  res.json({ month, reps: overview });
}));

// --- Incentive tiers (HR-configured slab scale, global) ---
const { getGlobalTiers, replaceGlobalTiers } = require('../services/tiers.service');
const { computeTieredIncentive } = require('../services/incentive.service');

router.get('/incentive-tiers', asyncHandler(async (req, res) => {
  const tiers = await getGlobalTiers();
  res.json({ tiers });
}));

const tierSchema = z.object({
  from: z.coerce.number().min(0),
  // null/blank => open-ended. Put null FIRST so it isn't coerced to 0.
  to: z.union([z.null(), z.coerce.number().min(0)]).optional(),
  percent: z.coerce.number().min(0).max(100),
});
const saveTiersSchema = z.object({
  tiers: z.array(tierSchema).min(1).max(5),
});
router.put('/incentive-tiers', validate({ body: saveTiersSchema }), asyncHandler(async (req, res) => {
  const tiers = await replaceGlobalTiers(req.body.tiers);
  // Audit who changed the incentive scale.
  try {
    await db('audit_logs').insert({
      actor_id: req.user.id,
      actor_email: req.user.email,
      action: 'incentive_tiers.update',
      target_type: 'incentive_tiers',
      target_id: 'global',
      detail: JSON.stringify(tiers),
    });
  } catch { /* audit table may not exist on older deploys; ignore */ }
  res.json({ ok: true, tiers });
}));

// Live preview: given target + achieved (+ optional tiers), return the calc.
const previewSchema = z.object({
  revenueTarget: z.coerce.number().min(0),
  achievedAmount: z.coerce.number().min(0),
  tiers: z.array(tierSchema).min(1).max(5).optional(),
});
router.post('/incentive-preview', validate({ body: previewSchema }), asyncHandler(async (req, res) => {
  const tiers = Array.isArray(req.body.tiers) ? req.body.tiers : await getGlobalTiers();
  const result = computeTieredIncentive(
    { revenueTarget: req.body.revenueTarget, achievedAmount: req.body.achievedAmount },
    tiers,
  );
  res.json(result);
}));

// --- Clients management (admin) ---
const { resolveGoogleMapsLocation } = require('../services/geocode.service');
const { storage: photoStorage } = require('../storage');

// List all clients with location status + (for pending) the proposed point/photo.
router.get('/clients', asyncHandler(async (req, res) => {
  const clients = await db('clients as c')
    .leftJoin('users as u', 'u.id', 'c.created_by_rep_id')
    .select(
      'c.id', 'c.name', 'c.phone', 'c.address',
      'c.reference_lat', 'c.reference_lng', 'c.geofence_radius_m',
      'c.location_status', 'c.location_source',
      'c.pending_lat', 'c.pending_lng', 'c.pending_visit_id',
      'c.created_at', 'u.name as created_by',
    )
    .orderBy('c.name');
  // Attach the pending visit photo URL (if any) for HR review.
  for (const c of clients) {
    if (c.pending_visit_id) {
      const ph = await db('visit_photos').where('visit_id', c.pending_visit_id).first();
      c.pending_photo_url = ph ? photoStorage.publicUrl(ph.file_path) : null;
    }
  }
  res.json({ clients, defaultRadiusM: config.visit.geofenceRadiusM });
}));

// Create a client (HR). Location optional — can be set now via Google link/coords.
const clientCreateSchema = z.object({
  name: z.string().min(1).max(190),
  phone: z.string().max(30).optional(),
  address: z.string().max(400).optional(),
  googleLocation: z.string().max(2000).optional(), // pasted Google Maps link or "lat,lng"
  geofenceRadiusM: z.coerce.number().int().min(10).max(5000).optional(),
});
router.post('/clients', validate({ body: clientCreateSchema }), asyncHandler(async (req, res) => {
  let lat = null; let lng = null; let status = 'unset';
  if (req.body.googleLocation) {
    const loc = await resolveGoogleMapsLocation(req.body.googleLocation);
    if (!loc) throw ApiError.badRequest('Could not read coordinates from that Google Maps link. Paste the full URL or "lat, lng".');
    lat = loc.lat.toFixed(7); lng = loc.lng.toFixed(7); status = 'approved';
  }
  const [id] = await db('clients').insert({
    name: req.body.name,
    phone: req.body.phone || null,
    address: req.body.address || null,
    reference_lat: lat,
    reference_lng: lng,
    location_status: status,
    location_source: status === 'approved' ? 'hr' : null,
    location_updated_by: status === 'approved' ? req.user.id : null,
    location_updated_at: status === 'approved' ? db.fn.now() : null,
    geofence_radius_m: req.body.geofenceRadiusM != null ? req.body.geofenceRadiusM : null,
    created_by_rep_id: req.user.id,
  });
  res.status(201).json({ ok: true, id });
}));

const clientIdParam = z.object({ id: z.coerce.number().int().positive() });

// Edit client info + radius (HR). Does NOT change the location here (see set-location).
const clientUpdateSchema = z.object({
  name: z.string().min(1).max(190).optional(),
  phone: z.union([z.null(), z.string().max(30)]).optional(),
  address: z.union([z.null(), z.string().max(400)]).optional(),
  geofenceRadiusM: z.union([z.null(), z.coerce.number().int().min(10).max(5000)]).optional(),
});
router.put('/clients/:id', validate({ params: clientIdParam, body: clientUpdateSchema }), asyncHandler(async (req, res) => {
  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) throw ApiError.notFound('Client not found');
  const patch = {};
  if (req.body.name !== undefined) patch.name = req.body.name;
  if (req.body.phone !== undefined) patch.phone = req.body.phone;
  if (req.body.address !== undefined) patch.address = req.body.address;
  if (req.body.geofenceRadiusM !== undefined) patch.geofence_radius_m = req.body.geofenceRadiusM;
  if (Object.keys(patch).length) await db('clients').where({ id: client.id }).update(patch);
  res.json({ ok: true });
}));

// Set / replace the APPROVED location (HR only) by pasting a Google Maps link or coords.
const setLocationSchema = z.object({ googleLocation: z.string().min(1).max(2000) });
router.put('/clients/:id/location', validate({ params: clientIdParam, body: setLocationSchema }), asyncHandler(async (req, res) => {
  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) throw ApiError.notFound('Client not found');
  const loc = await resolveGoogleMapsLocation(req.body.googleLocation);
  if (!loc) throw ApiError.badRequest('Could not read coordinates. Paste the full Google Maps URL or "lat, lng".');
  await db('clients').where({ id: client.id }).update({
    reference_lat: loc.lat.toFixed(7),
    reference_lng: loc.lng.toFixed(7),
    location_status: 'approved',
    location_source: 'hr',
    pending_lat: null, pending_lng: null, pending_visit_id: null, // clear any pending proposal
    location_updated_by: req.user.id,
    location_updated_at: db.fn.now(),
  });
  await db('audit_logs').insert({
    actor_id: req.user.id, actor_email: req.user.email, action: 'client.location.set',
    target_type: 'client', target_id: String(client.id), detail: JSON.stringify(loc),
  }).catch(() => {});
  res.json({ ok: true, lat: loc.lat, lng: loc.lng });
}));

// Approve a rep-proposed (pending) location -> becomes permanent (HR only).
router.post('/clients/:id/location/approve', validate({ params: clientIdParam }), asyncHandler(async (req, res) => {
  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) throw ApiError.notFound('Client not found');
  if (client.location_status !== 'pending' || client.pending_lat == null) {
    throw ApiError.badRequest('No pending location to approve for this client');
  }
  await db('clients').where({ id: client.id }).update({
    reference_lat: client.pending_lat,
    reference_lng: client.pending_lng,
    location_status: 'approved',
    location_source: 'rep',
    pending_lat: null, pending_lng: null, pending_visit_id: null,
    location_updated_by: req.user.id,
    location_updated_at: db.fn.now(),
  });
  await db('audit_logs').insert({
    actor_id: req.user.id, actor_email: req.user.email, action: 'client.location.approve',
    target_type: 'client', target_id: String(client.id),
  }).catch(() => {});
  res.json({ ok: true });
}));

// Reject a pending location -> back to unset (HR only).
router.post('/clients/:id/location/reject', validate({ params: clientIdParam }), asyncHandler(async (req, res) => {
  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) throw ApiError.notFound('Client not found');
  await db('clients').where({ id: client.id }).update({
    location_status: client.reference_lat ? 'approved' : 'unset',
    pending_lat: null, pending_lng: null, pending_visit_id: null,
  });
  res.json({ ok: true });
}));

router.delete('/clients/:id', validate({ params: clientIdParam }), asyncHandler(async (req, res) => {
  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) throw ApiError.notFound('Client not found');
  await db('clients').where({ id: client.id }).del();
  res.json({ ok: true });
}));

// --- Products management (admin): list / add / delete ---
const products = require('../services/products.service');

router.get('/products', asyncHandler(async (req, res) => {
  res.json({
    products: await products.listProducts(),
    leadModes: products.LEAD_MODES,
    leadModeLabels: products.LEAD_MODE_LABELS,
  });
}));

const productCreateSchema = z.object({ name: z.string().min(1).max(190) });
router.post('/products', validate({ body: productCreateSchema }), asyncHandler(async (req, res) => {
  const created = await products.createProduct(req.body.name);
  await db('audit_logs').insert({
    actor_id: req.user.id, actor_email: req.user.email, action: 'product.create',
    target_type: 'product', target_id: String(created.id), detail: created.name,
  }).catch(() => {});
  res.status(201).json({ ok: true, ...created });
}));

const productIdParam = z.object({ id: z.coerce.number().int().positive() });
router.delete('/products/:id', validate({ params: productIdParam }), asyncHandler(async (req, res) => {
  const r = await products.deleteProduct(req.params.id);
  await db('audit_logs').insert({
    actor_id: req.user.id, actor_email: req.user.email, action: 'product.delete',
    target_type: 'product', target_id: String(req.params.id), detail: r.deleted,
  }).catch(() => {});
  res.json(r);
}));

// --- Analytics for charts (filters: month, repId, product, leadMode, leadType) ---
const analyticsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  repId: z.coerce.number().int().positive().optional(),
  product: z.string().max(190).optional(),
  leadMode: z.enum(['platform', 'specific_dm', 'general_dm', 'direct_visit']).optional(),
  leadType: z.enum(['hot', 'warm', 'cold']).optional(),
});
router.get('/analytics', validate({ query: analyticsSchema }), asyncHandler(async (req, res) => {
  const data = await dashboard.analytics({
    month: req.query.month || dashboard.currentMonth(),
    repId: req.query.repId,
    product: req.query.product,
    leadMode: req.query.leadMode,
    leadType: req.query.leadType,
  });
  res.json(data);
}));

// --- Set target (per rep, per month) ---
const targetSchema = z.object({
  repId: z.coerce.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  clientTarget: z.coerce.number().int().min(0),
  revenueTarget: z.coerce.number().min(0),
});
router.post('/targets', validate({ body: targetSchema }), asyncHandler(async (req, res) => {
  const { repId, month, clientTarget, revenueTarget } = req.body;
  const rep = await db('users').where({ id: repId, role: 'rep' }).first();
  if (!rep) throw ApiError.notFound('Rep not found');
  const row = { rep_id: repId, month, client_target: clientTarget, revenue_target: revenueTarget.toFixed(2) };
  const existing = await db('targets').where({ rep_id: repId, month }).first();
  if (existing) await db('targets').where({ id: existing.id }).update(row);
  else await db('targets').insert(row);
  await dashboard.recomputeAndStoreIncentive(repId, month);
  res.json({ ok: true });
}));

// --- Set salary (admin-only data, per rep, per month) ---
const salarySchema = z.object({
  repId: z.coerce.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  monthlySalary: z.coerce.number().min(0),
});
router.post('/salaries', validate({ body: salarySchema }), asyncHandler(async (req, res) => {
  const { repId, month, monthlySalary } = req.body;
  const rep = await db('users').where({ id: repId, role: 'rep' }).first();
  if (!rep) throw ApiError.notFound('Rep not found');
  const row = { rep_id: repId, month, monthly_salary: monthlySalary.toFixed(2) };
  const existing = await db('salaries').where({ rep_id: repId, month }).first();
  if (existing) await db('salaries').where({ id: existing.id }).update(row);
  else await db('salaries').insert(row);
  await dashboard.recomputeAndStoreIncentive(repId, month);
  res.json({ ok: true });
}));

// --- Sales entries with product + lead-mode + lead-type filters ---
const salesFilterSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  repId: z.coerce.number().int().positive().optional(),
  product: z.string().max(190).optional(),
  leadMode: z.enum(['platform', 'specific_dm', 'general_dm', 'direct_visit']).optional(),
  leadType: z.enum(['hot', 'warm', 'cold']).optional(),
});
router.get('/sales', validate({ query: salesFilterSchema }), asyncHandler(async (req, res) => {
  const month = req.query.month || dashboard.currentMonth();
  const q = db('sales_entries as se')
    .join('users as u', 'u.id', 'se.rep_id')
    .whereRaw("DATE_FORMAT(se.sale_date, '%Y-%m') = ?", [month])
    .select('se.*', 'u.name as rep_name')
    .orderBy('se.sale_date', 'desc');
  if (req.query.repId) q.andWhere('se.rep_id', req.query.repId);
  if (req.query.product) q.andWhere('se.product', req.query.product);
  if (req.query.leadMode) q.andWhere('se.lead_mode', req.query.leadMode);
  if (req.query.leadType) q.andWhere('se.lead_type', req.query.leadType);
  const sales = await q;
  res.json({ month, sales });
}));

// --- Movement: a rep's travel path for ONE day (Google-Timeline style) ---
// Date defaults to today; any date within the last ~3 months is selectable.
// Pings are grouped into per-session polylines so multiple trips in a day stay
// as separate route lines.
const movementParams = z.object({ repId: z.coerce.number().int().positive() });
const movementQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
router.get(
  '/movement/:repId',
  validate({ params: movementParams, query: movementQuery }),
  asyncHandler(async (req, res) => {
    const repId = req.params.repId;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // All pings for the rep on that calendar day, ordered chronologically.
    const pings = await db('location_pings')
      .where('rep_id', repId)
      .andWhereRaw('DATE(recorded_at) = ?', [date])
      .orderBy('recorded_at')
      .select('session_id', 'lat', 'lng', 'recorded_at');

    // Group into one polyline per work session (one "trip").
    const bySession = new Map();
    for (const p of pings) {
      if (!bySession.has(p.session_id)) bySession.set(p.session_id, []);
      bySession.get(p.session_id).push(p);
    }
    const sessions = [...bySession.entries()].map(([sessionId, pts]) => ({
      session: { id: sessionId, started_at: pts[0].recorded_at, ended_at: pts[pts.length - 1].recorded_at },
      pings: pts.map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at })),
    }));

    // Named markers only at client-visit points captured that day.
    const visits = await db('visits as v')
      .leftJoin('clients as c', 'c.id', 'v.client_id')
      .where('v.rep_id', repId)
      .andWhereRaw('DATE(v.server_timestamp) = ?', [date])
      .select('v.id', 'v.capture_lat', 'v.capture_lng', 'v.status', 'c.name as client_name', 'v.server_timestamp');

    res.json({ repId, date, sessions, visitMarkers: visits, pingCount: pings.length });
  }),
);

// --- Days (last 90) that have any movement data for a rep, for the date picker ---
router.get(
  '/movement/:repId/dates',
  validate({ params: movementParams }),
  asyncHandler(async (req, res) => {
    const rows = await db('location_pings')
      .where('rep_id', req.params.repId)
      .andWhereRaw('recorded_at >= (CURDATE() - INTERVAL 90 DAY)')
      .select(db.raw('DATE(recorded_at) as d'))
      .groupBy('d')
      .orderBy('d', 'desc');
    res.json({ dates: rows.map((r) => (r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10))) });
  }),
);

// --- Live: latest ping per active rep ---
router.get('/live', asyncHandler(async (req, res) => {
  const active = await db('work_sessions').whereNull('ended_at');
  const live = [];
  for (const s of active) {
    const last = await db('location_pings').where('session_id', s.id).orderBy('recorded_at', 'desc').first();
    const rep = await db('users').where('id', s.rep_id).first();
    if (last) live.push({ repId: s.rep_id, repName: rep ? rep.name : null, lat: last.lat, lng: last.lng, recordedAt: last.recorded_at });
  }
  res.json({ live });
}));

// --- Visits with photos + anti-cheat flags ---
const visitsFilterSchema = z.object({
  repId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pass', 'flag', 'reject']).optional(),
});
router.get('/visits', validate({ query: visitsFilterSchema }), asyncHandler(async (req, res) => {
  const q = db('visits as v')
    .join('users as u', 'u.id', 'v.rep_id')
    .leftJoin('clients as c', 'c.id', 'v.client_id')
    .select('v.*', 'u.name as rep_name', 'c.name as client_name')
    .orderBy('v.created_at', 'desc');
  if (req.query.repId) q.andWhere('v.rep_id', req.query.repId);
  if (req.query.status) q.andWhere('v.status', req.query.status);
  const visits = await q;
  for (const v of visits) {
    const photos = await db('visit_photos').where('visit_id', v.id).select('id', 'file_path', 'created_at');
    // Build a ready-to-use absolute URL via the storage interface so the client
    // works with either the local-disk or Azure Blob driver.
    v.photos = photos.map((p) => ({ ...p, url: storage.publicUrl(p.file_path) }));
  }
  res.json({ visits });
}));

// --- Delete visit photos (HR removes images from the DB + storage) ---
// Accepts a list of visit_photo ids. Removes the underlying file via the storage
// interface, then the DB row. The visit record itself is kept.
const deletePhotosSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
});
router.post('/visit-photos/delete', validate({ body: deletePhotosSchema }), asyncHandler(async (req, res) => {
  const rows = await db('visit_photos').whereIn('id', req.body.ids).select('id', 'file_path');
  let filesRemoved = 0;
  for (const row of rows) {
    try { await storage.remove(row.file_path); filesRemoved += 1; } catch { /* ignore missing file */ }
  }
  const deleted = await db('visit_photos').whereIn('id', req.body.ids).del();
  await db('audit_logs').insert({
    actor_id: req.user.id, actor_email: req.user.email, action: 'visit_photo.delete',
    target_type: 'visit_photo', target_id: req.body.ids.join(','), detail: `${deleted} deleted`,
  }).catch(() => {});
  res.json({ ok: true, deleted, filesRemoved });
}));

// --- Photo retention: purge photos older than the retention window (on demand) ---
// The scheduled sweep runs automatically; this lets an admin trigger it now.
// Optional ?days= overrides the configured window for this run only.
const purgeSchema = z.object({
  days: z.coerce.number().int().positive().max(3650).optional(),
});
router.post('/photos/purge', validate({ query: purgeSchema }), asyncHandler(async (req, res) => {
  const result = await purgeOldPhotos({ days: req.query.days });
  res.json({ ok: true, ...result });
}));

// --- Excel export (5 sheets) ---
router.get('/export', validate({ query: monthSchema }), asyncHandler(async (req, res) => {
  const month = monthParam(req);
  const wb = await buildWorkbook(month);
  await db('export_logs').insert({ admin_id: req.user.id, export_type: `xlsx:${month}` });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ara-sales-${month}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

module.exports = router;
