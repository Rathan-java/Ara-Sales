'use strict';

/**
 * Visit-photo retention.
 *
 * Deletes photos older than `retentionDays` to cap storage/cost. For each old
 * `visit_photos` row we remove the underlying file (local disk or Azure Blob)
 * via the storage interface, then delete the DB row. The parent `visit` record
 * (status, geofence/mock flags, GPS, timestamps) is intentionally KEPT so the
 * anti-fraud audit trail survives even after the image is purged.
 *
 * Idempotent and safe to run repeatedly (cron or in-process scheduler).
 */

const db = require('../db/knex');
const { storage } = require('../storage');
const config = require('../config');

/**
 * Purge visit photos older than the cutoff.
 * @param {object} [opts]
 * @param {number} [opts.days] retention window in days (default from config)
 * @param {number} [opts.batchSize] rows per batch (default 500)
 * @param {Date}   [opts.now] clock injection for tests
 * @returns {Promise<{ deleted:number, filesRemoved:number, fileErrors:number, cutoff:string, skipped?:boolean }>}
 */
async function purgeOldPhotos(opts = {}) {
  const days = opts.days ?? config.retention.photoDays;
  const batchSize = opts.batchSize ?? 500;
  const now = opts.now ?? new Date();

  // 0 (or negative) disables cleanup — nothing is deleted.
  if (!days || days <= 0) {
    return { deleted: 0, filesRemoved: 0, fileErrors: 0, cutoff: 'disabled', skipped: true };
  }

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  let deleted = 0;
  let filesRemoved = 0;
  let fileErrors = 0;

  // Process in batches so a large backlog doesn't load everything at once.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await db('visit_photos')
      .where('created_at', '<', cutoff)
      .orderBy('created_at', 'asc') // oldest first
      .limit(batchSize)
      .select('id', 'file_path');

    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        await storage.remove(row.file_path);
        filesRemoved += 1;
      } catch (err) {
        // Don't let one bad file block the rest; the DB row is still removed so
        // we don't loop on it forever. Orphaned files are rare and harmless.
        fileErrors += 1;
        // eslint-disable-next-line no-console
        console.warn(`[retention] could not remove file ${row.file_path}: ${err.message}`);
      }
    }

    const ids = rows.map((r) => r.id);
    await db('visit_photos').whereIn('id', ids).del();
    deleted += ids.length;

    if (rows.length < batchSize) break; // last batch
  }

  return {
    deleted,
    filesRemoved,
    fileErrors,
    cutoff: cutoff.toISOString(),
  };
}

module.exports = { purgeOldPhotos };
