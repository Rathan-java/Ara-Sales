'use strict';

const { createApp } = require('./app');
const config = require('./config');
const db = require('./db/knex');
const { startRetentionScheduler } = require('./services/retention.scheduler');

async function start() {
  // Optionally run pending migrations on boot (PaaS without a release step).
  // We NEVER auto-seed in production — seeding truncates tables.
  if (config.autoMigrate) {
    try {
      const [, applied] = await db.migrate.latest();
      // eslint-disable-next-line no-console
      console.log(applied && applied.length
        ? `Migrations applied: ${applied.join(', ')}`
        : 'Migrations up to date.');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Migration on boot failed:', err.message);
      process.exit(1);
    }
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Ara Sales API listening on port ${config.port} [${config.env}]`);
  });

  // Start the photo-retention sweep (no-op if disabled via env).
  const retention = startRetentionScheduler();

  // Graceful shutdown: stop accepting connections, then close the DB pool.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      // eslint-disable-next-line no-console
      console.log(`\n${sig} received, shutting down...`);
      retention.stop();
      server.close(async () => {
        try { await db.destroy(); } catch { /* ignore */ }
        process.exit(0);
      });
    });
  }

  return server;
}

start();
