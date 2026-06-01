'use strict';

/**
 * Photo-retention tests (need MySQL + seed). Verifies:
 *   - photos older than the window are deleted (row + file)
 *   - newer photos are kept
 *   - the parent visit record is preserved (audit trail survives)
 *   - days=0 disables cleanup
 *
 * Uses the LOCAL storage driver (default in dev/test); writes a real temp file
 * so we can confirm storage.remove() actually deletes it.
 *
 * Run with: npm run test:retention   (skips cleanly if MySQL is unreachable)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

let db; let storage; let purgeOldPhotos; let up = true;
try {
  db = require('../src/db/knex');
  ({ storage } = require('../src/storage'));
  ({ purgeOldPhotos } = require('../src/services/retention.service'));
} catch (err) {
  up = false;
  // eslint-disable-next-line no-console
  console.error('Skipping retention tests (deps missing):', err.message);
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

test('photo retention purge', { concurrency: false }, async (t) => {
  if (!up) { t.skip('deps not installed'); return; }
  try { await db.raw('SELECT 1'); } catch { t.skip('MySQL not reachable'); return; }
  await db.migrate.latest();

  // Need a visit to attach photos to. Grab any seeded visit, else make one.
  let visit = await db('visits').first();
  if (!visit) {
    const user = await db('users').first();
    const client = await db('clients').first();
    const [id] = await db('visits').insert({
      rep_id: user.id, client_id: client.id, visit_code: '000000',
      code_issued_at: new Date(), code_expires_at: new Date(), code_used: true,
      capture_lat: '0', capture_lng: '0', server_timestamp: new Date(),
      geofence_pass: true, mock_location_flag: false, status: 'pass',
    });
    visit = { id };
  }

  // Write two real files via the storage interface.
  const oldRel = await storage.save(Buffer.from('old-photo'), 'retention_old.jpg', 'visits/test');
  const newRel = await storage.save(Buffer.from('new-photo'), 'retention_new.jpg', 'visits/test');

  // Old photo row (90 days ago) + new photo row (1 day ago).
  const [oldId] = await db('visit_photos').insert({
    visit_id: visit.id, file_path: oldRel, created_at: daysAgo(90),
  });
  const [newId] = await db('visit_photos').insert({
    visit_id: visit.id, file_path: newRel, created_at: daysAgo(1),
  });

  await t.test('purge(60d) deletes old, keeps new, keeps the visit', async () => {
    const res = await purgeOldPhotos({ days: 60 });
    assert.ok(res.deleted >= 1, 'at least the old photo deleted');

    const oldRow = await db('visit_photos').where({ id: oldId }).first();
    const newRow = await db('visit_photos').where({ id: newId }).first();
    assert.equal(oldRow, undefined, 'old photo row removed');
    assert.ok(newRow, 'new photo row kept');

    // Old file gone, new file still present (local driver).
    if (!storage.isRemote) {
      assert.equal(fs.existsSync(storage.absolutePath(oldRel)), false, 'old file deleted');
      assert.equal(fs.existsSync(storage.absolutePath(newRel)), true, 'new file kept');
    }

    // The parent visit record must survive.
    const stillThere = await db('visits').where({ id: visit.id }).first();
    assert.ok(stillThere, 'visit audit record preserved');
  });

  await t.test('days=0 disables cleanup', async () => {
    const res = await purgeOldPhotos({ days: 0 });
    assert.equal(res.skipped, true);
    assert.equal(res.deleted, 0);
  });

  // Cleanup the new photo we created.
  await db('visit_photos').where({ id: newId }).del();
  if (!storage.isRemote) {
    try { fs.unlinkSync(storage.absolutePath(newRel)); } catch { /* ignore */ }
  } else {
    try { await storage.remove(newRel); } catch { /* ignore */ }
  }
  await db.destroy();
});
