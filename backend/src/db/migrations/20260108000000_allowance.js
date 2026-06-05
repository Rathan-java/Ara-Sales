'use strict';

/**
 * Additive: a simple key/value app_settings table to hold the travel-allowance
 * rate per kilometre (₹/km). Touches no existing data.
 */

exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('app_settings');
  if (!has) {
    await knex.schema.createTable('app_settings', (t) => {
      t.string('key', 80).primary();
      t.string('value', 255).notNullable();
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
  const existing = await knex('app_settings').where({ key: 'allowance_per_km' }).first();
  if (!existing) {
    await knex('app_settings').insert({ key: 'allowance_per_km', value: '0' });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('app_settings');
};
