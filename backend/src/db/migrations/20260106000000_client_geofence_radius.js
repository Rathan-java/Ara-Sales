'use strict';

/**
 * Additive: client location-approval workflow + contact fields.
 *
 *  - geofence_radius_m : optional per-client radius (null = global default 150m)
 *  - phone, address    : editable client info (by HR or rep)
 *  - location_status   : 'unset' | 'pending' | 'approved'
 *                        approved  = permanent, geofence enforced, HR-only edits
 *                        pending   = a rep's captured GPS awaiting HR approval
 *                        unset     = no location yet
 *  - location_source   : 'hr' (pasted Google link) | 'rep' (visit photo) | null
 *  - pending_lat/lng   : a rep-proposed location awaiting HR review
 *  - pending_visit_id  : the visit whose photo proposed the pending location
 *  - location_updated_by / at : audit of who set the approved location
 *
 * Existing clients: any that ALREADY have reference_lat/lng are backfilled to
 * 'approved' (they were auto-set by the old first-visit rule) so nothing breaks.
 */

exports.up = async function up(knex) {
  const addCol = async (col, fn) => {
    const has = await knex.schema.hasColumn('clients', col);
    if (!has) await knex.schema.alterTable('clients', fn);
  };

  await addCol('geofence_radius_m', (t) => t.integer('geofence_radius_m').nullable());
  await addCol('phone', (t) => t.string('phone', 30).nullable());
  await addCol('address', (t) => t.string('address', 400).nullable());
  await addCol('location_status', (t) => t.enu('location_status', ['unset', 'pending', 'approved']).notNullable().defaultTo('unset'));
  await addCol('location_source', (t) => t.string('location_source', 10).nullable());
  await addCol('pending_lat', (t) => t.decimal('pending_lat', 10, 7).nullable());
  await addCol('pending_lng', (t) => t.decimal('pending_lng', 10, 7).nullable());
  await addCol('pending_visit_id', (t) => t.integer('pending_visit_id').unsigned().nullable());
  await addCol('location_updated_by', (t) => t.integer('location_updated_by').unsigned().nullable());
  await addCol('location_updated_at', (t) => t.datetime('location_updated_at').nullable());

  // Backfill: existing clients with a reference point are treated as approved.
  await knex('clients')
    .whereNotNull('reference_lat')
    .whereNotNull('reference_lng')
    .update({ location_status: 'approved', location_source: 'rep' });
};

exports.down = async function down(knex) {
  for (const col of [
    'geofence_radius_m', 'phone', 'address', 'location_status', 'location_source',
    'pending_lat', 'pending_lng', 'pending_visit_id', 'location_updated_by', 'location_updated_at',
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const has = await knex.schema.hasColumn('clients', col);
    // eslint-disable-next-line no-await-in-loop
    if (has) await knex.schema.alterTable('clients', (t) => t.dropColumn(col));
  }
};
