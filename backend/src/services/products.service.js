'use strict';

/**
 * Product catalogue. A product is just a name (e.g. "SchoolMate"). Products can
 * be added and deleted. Deleting truly removes the product row, but historical
 * sales keep the product NAME they were booked with (sales_entries.product is a
 * string), so deleting never corrupts past data.
 */

const db = require('../db/knex');
const { ApiError } = require('../middleware/error');

async function listProducts() {
  return db('products').select('id', 'name', 'created_at').orderBy('name');
}

/** Allowed lead modes (fixed). */
const LEAD_MODES = ['platform', 'specific_dm', 'general_dm', 'direct_visit'];
const LEAD_MODE_LABELS = {
  platform: 'Platform',
  specific_dm: 'Specific Digital Marketing',
  general_dm: 'General Digital Marketing',
  direct_visit: 'Direct Visit',
};

async function createProduct(name) {
  const clean = String(name || '').trim();
  if (!clean) throw ApiError.badRequest('Product name is required');
  // Only an EXISTING product blocks creation (case-insensitive). A previously
  // deleted name can be created again freely.
  const existing = await db('products').whereRaw('LOWER(name) = ?', [clean.toLowerCase()]).first();
  if (existing) throw ApiError.conflict('A product with that name already exists');
  const [id] = await db('products').insert({ name: clean });
  return { id, name: clean };
}

async function deleteProduct(id) {
  const p = await db('products').where({ id }).first();
  if (!p) throw ApiError.notFound('Product not found');
  await db('products').where({ id }).del();
  return { ok: true, deleted: p.name };
}

/** True if a product with this exact name currently exists (for sale validation). */
async function productExists(name) {
  const p = await db('products').whereRaw('LOWER(name) = ?', [String(name || '').toLowerCase()]).first();
  return !!p;
}

module.exports = {
  listProducts,
  createProduct,
  deleteProduct,
  productExists,
  LEAD_MODES,
  LEAD_MODE_LABELS,
};
