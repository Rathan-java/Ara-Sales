'use strict';

/**
 * Optional MySQL-backed photo storage.
 *
 * When STORAGE_DRIVER=mysql, visit photo bytes are stored here as LONGBLOB so the
 * app needs no external object store (Azure Blob / S3) — only the MySQL you
 * already have. `key` is the same relative path stored in visit_photos.file_path,
 * so the existing retention cleanup (delete by file_path) works unchanged.
 *
 * Note: storing binaries in MySQL is fine at small/medium scale (a few reps); the
 * 60-day retention sweep keeps the table from growing unbounded. For large scale,
 * switch STORAGE_DRIVER to azure with no code change.
 */

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('photo_blobs');
  if (!exists) {
    await knex.schema.createTable('photo_blobs', (t) => {
      t.increments('id').primary();
      t.string('key', 512).notNullable().unique(); // == visit_photos.file_path
      t.string('content_type', 80).notNullable().defaultTo('image/jpeg');
      t.specificType('data', 'LONGBLOB').notNullable();
      t.integer('size_bytes').unsigned().notNullable().defaultTo(0);
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('photo_blobs');
};
