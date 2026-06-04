'use strict';

const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../middleware/error');
const { authenticate, requireRole } = require('../middleware/auth');
const db = require('../db/knex');
const config = require('../config');
const dashboard = require('../services/dashboard.service');
const { storage } = require('../storage');
const { compressImage } = require('../services/image.service');
const { nowUtc, toMysqlDateTime } = require('../utils/time');
const {
  generateVisitCode, validateVisitCode, evaluateGeofence, decideVisitStatus,
} = require('../services/visit.service');

const router = express.Router();

// Camera captures only — held in memory then handed to the storage interface.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

router.use(authenticate, requireRole('rep'));

// ============ Dashboard (rep sees ONLY their own data; never salary) ============
router.get('/dashboard', asyncHandler(async (req, res) => {
  const month = req.query.month || dashboard.currentMonth();
  const summary = await dashboard.repMonthSummary(req.user.id, month, { includeSalary: false });
  res.json({ month, summary });
}));

// ============ Analytics for the rep's own charts (filters: month, product, leadType) ============
const repAnalyticsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  product: z.enum(['schoolmate', 'school_dm', 'general_dm', 'both']).optional(),
  leadType: z.enum(['hot', 'warm', 'cold']).optional(),
});
router.get('/analytics', validate({ query: repAnalyticsSchema }), asyncHandler(async (req, res) => {
  // repId is forced to the logged-in rep — they can never see others' data.
  const data = await dashboard.analytics({
    month: req.query.month || dashboard.currentMonth(),
    repId: req.user.id,
    product: req.query.product,
    leadType: req.query.leadType,
  });
  // Strip the per-rep breakdown (irrelevant for a single rep) to avoid leaking names.
  delete data.byRep;
  res.json(data);
}));

// ============ Sales entry ============
const saleSchema = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  clientName: z.string().min(1).max(190),
  product: z.enum(['schoolmate', 'school_dm', 'general_dm', 'both']),
  leadType: z.enum(['hot', 'warm', 'cold']),
  amount: z.coerce.number().min(0),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional(),
});
router.post('/sales', validate({ body: saleSchema }), asyncHandler(async (req, res) => {
  const b = req.body;
  const [id] = await db('sales_entries').insert({
    rep_id: req.user.id,
    client_id: b.clientId || null,
    client_name: b.clientName,
    product: b.product,
    lead_type: b.leadType,
    amount: b.amount.toFixed(2), // fixed precision
    sale_date: b.saleDate,
    notes: b.notes || null,
  });
  // Keep incentive snapshot fresh for the sale's month.
  const month = b.saleDate.slice(0, 7);
  await dashboard.recomputeAndStoreIncentive(req.user.id, month);
  res.status(201).json({ ok: true, id });
}));

router.get('/sales', asyncHandler(async (req, res) => {
  const month = req.query.month || dashboard.currentMonth();
  const sales = await db('sales_entries')
    .where('rep_id', req.user.id)
    .andWhereRaw("DATE_FORMAT(sale_date, '%Y-%m') = ?", [month])
    .orderBy('sale_date', 'desc');
  res.json({ month, sales });
}));

// ============ Clients ============
// Reps can create/edit client INFO (name, phone, address) but NEVER the location.
// The location becomes set only when (a) HR pastes a Google Maps link, or
// (b) the rep visits & photographs the spot and HR approves that captured GPS.
const clientSchema = z.object({
  name: z.string().min(1).max(190),
  phone: z.string().max(30).optional(),
  address: z.string().max(400).optional(),
});
router.post('/clients', validate({ body: clientSchema }), asyncHandler(async (req, res) => {
  const [id] = await db('clients').insert({
    name: req.body.name,
    phone: req.body.phone || null,
    address: req.body.address || null,
    location_status: 'unset', // location is set later by HR or via visit+approval
    created_by_rep_id: req.user.id,
  });
  res.status(201).json({ ok: true, id });
}));

const clientEditSchema = z.object({
  name: z.string().min(1).max(190).optional(),
  phone: z.union([z.null(), z.string().max(30)]).optional(),
  address: z.union([z.null(), z.string().max(400)]).optional(),
});
const repClientIdParam = z.object({ id: z.coerce.number().int().positive() });
router.put('/clients/:id', validate({ params: repClientIdParam, body: clientEditSchema }), asyncHandler(async (req, res) => {
  const client = await db('clients').where({ id: req.params.id }).first();
  if (!client) throw ApiError.notFound('Client not found');
  const patch = {};
  if (req.body.name !== undefined) patch.name = req.body.name;
  if (req.body.phone !== undefined) patch.phone = req.body.phone;
  if (req.body.address !== undefined) patch.address = req.body.address;
  // Note: reps cannot touch reference_lat/lng/location_status here by design.
  if (Object.keys(patch).length) await db('clients').where({ id: client.id }).update(patch);
  res.json({ ok: true });
}));

router.get('/clients', asyncHandler(async (req, res) => {
  const clients = await db('clients')
    .select('id', 'name', 'phone', 'address', 'reference_lat', 'reference_lng', 'location_status')
    .orderBy('name');
  res.json({ clients });
}));

// ============ Work tracking (Start/End + 5-min pings) ============
router.post('/work/start', asyncHandler(async (req, res) => {
  const open = await db('work_sessions').where({ rep_id: req.user.id }).whereNull('ended_at').first();
  if (open) throw ApiError.conflict('A work session is already active', { sessionId: open.id });
  const [id] = await db('work_sessions').insert({
    rep_id: req.user.id, started_at: toMysqlDateTime(nowUtc()),
  });
  res.status(201).json({ ok: true, sessionId: id });
}));

const pingSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});
router.post('/work/ping', validate({ body: pingSchema }), asyncHandler(async (req, res) => {
  const session = await db('work_sessions').where({ id: req.body.sessionId, rep_id: req.user.id }).first();
  if (!session) throw ApiError.notFound('Session not found');
  if (session.ended_at) throw ApiError.badRequest('Session already ended');
  await db('location_pings').insert({
    session_id: session.id,
    rep_id: req.user.id,
    lat: Number(req.body.lat).toFixed(7),
    lng: Number(req.body.lng).toFixed(7),
    recorded_at: toMysqlDateTime(nowUtc()), // server time
  });
  res.json({ ok: true });
}));

router.post('/work/end', asyncHandler(async (req, res) => {
  const session = await db('work_sessions').where({ rep_id: req.user.id }).whereNull('ended_at').first();
  if (!session) throw ApiError.notFound('No active session');
  await db('work_sessions').where({ id: session.id }).update({ ended_at: toMysqlDateTime(nowUtc()) });
  res.json({ ok: true, sessionId: session.id });
}));

// ============ Visit verification flow ============
// Step 1: Start Visit -> issue a one-time, short-lived code tied to rep+client.
const startVisitSchema = z.object({ clientId: z.coerce.number().int().positive() });
router.post('/visits/start', validate({ body: startVisitSchema }), asyncHandler(async (req, res) => {
  const client = await db('clients').where({ id: req.body.clientId }).first();
  if (!client) throw ApiError.notFound('Client not found');

  const { code, issuedAt, expiresAt } = generateVisitCode({
    now: () => nowUtc(),
    ttlSeconds: config.visit.codeTtlSeconds,
  });
  const [id] = await db('visits').insert({
    rep_id: req.user.id,
    client_id: client.id,
    visit_code: code,
    code_issued_at: toMysqlDateTime(issuedAt),
    code_expires_at: toMysqlDateTime(expiresAt),
    code_used: false,
  });
  // The code + server timestamp are returned so the app can burn them into the
  // photo overlay. GPS + map thumbnail are added client-side (flutter_map).
  res.status(201).json({
    ok: true,
    visitId: id,
    visitCode: code,
    serverTimestamp: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: config.visit.codeTtlSeconds,
  });
}));

// Step 2: Upload the stamped photo -> server re-verifies everything.
const submitVisitSchema = z.object({
  visitId: z.coerce.number().int().positive(),
  visitCode: z.string().min(4).max(12),
  captureLat: z.coerce.number(),
  captureLng: z.coerce.number(),
  mockLocation: z.coerce.boolean().optional(),
});
router.post(
  '/visits/submit',
  upload.single('photo'),
  validate({ body: submitVisitSchema }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Camera photo is required (multipart field "photo")');

    const visit = await db('visits').where({ id: req.body.visitId, rep_id: req.user.id }).first();
    if (!visit) throw ApiError.notFound('Visit not found');

    // (a) One-time code: must be the issued code, unused, unexpired (server time).
    const codeCheck = validateVisitCode(visit, req.body.visitCode, nowUtc());

    // (b) Geofence vs the client's APPROVED reference only. If the location is
    // not approved yet (unset/pending), there is nothing to validate against, so
    // the geofence passes and the rep's capture is proposed for HR approval.
    const client = await db('clients').where({ id: visit.client_id }).first();
    const hasApprovedLocation = client.location_status === 'approved'
      && client.reference_lat != null && client.reference_lng != null;
    const geo = evaluateGeofence({
      referenceLat: hasApprovedLocation ? client.reference_lat : null,
      referenceLng: hasApprovedLocation ? client.reference_lng : null,
      captureLat: req.body.captureLat,
      captureLng: req.body.captureLng,
      // Use the client's own radius if HR set one; else the global default.
      radiusM: client.geofence_radius_m != null ? Number(client.geofence_radius_m) : config.visit.geofenceRadiusM,
    });

    // (c) Mock-location / fake GPS reported by the device.
    const mockLocation = Boolean(req.body.mockLocation);

    const status = decideVisitStatus({
      codeValid: codeCheck.valid,
      geofencePass: geo.pass,
      mockLocation,
      rejectOnMock: config.visit.rejectOnMock,
    });

    // Reject outright on invalid code or mock GPS — do NOT store the photo.
    if (status === 'reject') {
      await db('visits').where({ id: visit.id }).update({
        capture_lat: Number(req.body.captureLat).toFixed(7),
        capture_lng: Number(req.body.captureLng).toFixed(7),
        server_timestamp: toMysqlDateTime(nowUtc()),
        geofence_pass: geo.pass,
        mock_location_flag: mockLocation,
        status: 'reject',
      });
      throw ApiError.badRequest('Visit rejected', {
        codeValid: codeCheck.valid,
        codeReason: codeCheck.reason,
        geofencePass: geo.pass,
        mockLocation,
      });
    }

    // Burn the code (single use) and persist verification result.
    await db('visits').where({ id: visit.id }).update({
      code_used: true,
      capture_lat: Number(req.body.captureLat).toFixed(7),
      capture_lng: Number(req.body.captureLng).toFixed(7),
      server_timestamp: toMysqlDateTime(nowUtc()),
      geofence_pass: geo.pass,
      mock_location_flag: mockLocation,
      status,
    });

    // If the client has no APPROVED location yet, this capture is PROPOSED to HR
    // for approval (it does NOT auto-become the permanent location anymore).
    // Only set a proposal if there isn't already an approved location.
    if (!hasApprovedLocation) {
      await db('clients').where({ id: client.id }).update({
        location_status: 'pending',
        location_source: 'rep',
        pending_lat: Number(req.body.captureLat).toFixed(7),
        pending_lng: Number(req.body.captureLng).toFixed(7),
        pending_visit_id: visit.id,
      });
    }

    // Downscale + recompress for compact storage (the verification overlay —
    // code, server time, GPS, map — is already burned into the image by the app,
    // so a smaller JPEG keeps the evidence readable at a fraction of the size).
    const { buffer: photoBuffer } = await compressImage(req.file.buffer);
    const filename = `visit_${visit.id}_${Date.now()}.jpg`;
    const relPath = await storage.save(photoBuffer, filename, `visits/${req.user.id}`);
    await db('visit_photos').insert({ visit_id: visit.id, file_path: relPath });

    res.json({
      ok: true,
      status, // 'pass' or 'flag'
      geofence: { pass: geo.pass, distanceM: geo.distanceM },
      photoUrl: storage.publicUrl(relPath),
    });
  }),
);

// Rep's own visit history.
router.get('/visits', asyncHandler(async (req, res) => {
  const visits = await db('visits as v')
    .leftJoin('clients as c', 'c.id', 'v.client_id')
    .where('v.rep_id', req.user.id)
    .select('v.id', 'v.status', 'v.geofence_pass', 'v.server_timestamp', 'c.name as client_name')
    .orderBy('v.created_at', 'desc');
  res.json({ visits });
}));

module.exports = router;
