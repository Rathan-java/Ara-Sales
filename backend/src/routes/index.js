'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const repRoutes = require('./rep.routes');
const { asyncHandler, ApiError } = require('../middleware/error');
const { storage } = require('../storage');

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true, service: 'ara-sales-api' }));

// Public photo serving for the MySQL storage driver. Mirrors how the local
// driver exposes files via express.static at /uploads — images are referenced
// by <img src> so this must be unauthenticated (the key is an opaque path).
// Only active when the driver implements fetch() (i.e. STORAGE_DRIVER=mysql).
if (typeof storage.fetch === 'function') {
  router.get('/photos/:key', asyncHandler(async (req, res) => {
    const found = await storage.fetch(req.params.key);
    if (!found) throw ApiError.notFound('Photo not found');
    res.setHeader('Content-Type', found.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(found.data);
  }));
}

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/rep', repRoutes);

module.exports = router;
