'use strict';

/**
 * In-process scheduler for the photo-retention sweep. Runs once shortly after
 * boot, then on a fixed interval (config.retention.sweepIntervalHours).
 *
 * Disable by setting RETENTION_SWEEP_HOURS=0 (e.g. when an external cron / the
 * `npm run purge:photos` script handles it instead). Returns a stop() handle.
 */

const config = require('../config');
const { purgeOldPhotos } = require('./retention.service');

function startRetentionScheduler() {
  const hours = config.retention.sweepIntervalHours;
  if (!hours || hours <= 0) {
    // eslint-disable-next-line no-console
    console.log('[retention] in-process scheduler disabled (RETENTION_SWEEP_HOURS=0).');
    return { stop() {} };
  }
  if (!config.retention.photoDays || config.retention.photoDays <= 0) {
    // eslint-disable-next-line no-console
    console.log('[retention] photo cleanup disabled (PHOTO_RETENTION_DAYS=0).');
    return { stop() {} };
  }

  const run = async () => {
    try {
      const res = await purgeOldPhotos();
      if (res.deleted > 0) {
        // eslint-disable-next-line no-console
        console.log(`[retention] purged ${res.deleted} photo(s) older than ${config.retention.photoDays}d `
          + `(files removed ${res.filesRemoved}, errors ${res.fileErrors}).`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[retention] sweep failed:', err.message);
    }
  };

  // First run 60s after boot (let the app settle), then every `hours`.
  const kickoff = setTimeout(run, 60 * 1000);
  const interval = setInterval(run, hours * 60 * 60 * 1000);
  if (interval.unref) interval.unref(); // don't keep the process alive just for this
  if (kickoff.unref) kickoff.unref();

  // eslint-disable-next-line no-console
  console.log(`[retention] scheduler on: every ${hours}h, keep ${config.retention.photoDays} days.`);
  return {
    stop() { clearTimeout(kickoff); clearInterval(interval); },
  };
}

module.exports = { startRetentionScheduler };
