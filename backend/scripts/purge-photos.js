'use strict';

/**
 * One-shot photo-retention purge, for cron / scheduled tasks.
 *
 *   node scripts/purge-photos.js [days]
 *   npm run purge:photos
 *
 * `days` (optional) overrides PHOTO_RETENTION_DAYS for this run.
 * Exits 0 on success, 1 on failure. Closes the DB pool so it doesn't hang.
 */

const db = require('../src/db/knex');
const { purgeOldPhotos } = require('../src/services/retention.service');

async function main() {
  const arg = process.argv[2];
  const days = arg ? Number(arg) : undefined;
  const result = await purgeOldPhotos({ days });
  // eslint-disable-next-line no-console
  console.log(`[purge] ${JSON.stringify(result)}`);
}

main()
  .then(() => db.destroy())
  .then(() => process.exit(0))
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[purge] failed:', err.message);
    try { await db.destroy(); } catch { /* ignore */ }
    process.exit(1);
  });
