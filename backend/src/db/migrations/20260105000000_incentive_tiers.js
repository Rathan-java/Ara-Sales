'use strict';

/**
 * Additive migration — incentive_tiers holds the HR-configured slab scale for
 * the tiered incentive (on revenue surplus). Global scale for now (no rep/month
 * scoping), but `scope`/`scope_ref` are reserved so per-rep or per-month can be
 * added later without another migration. Touches no existing data.
 */

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('incentive_tiers');
  if (!exists) {
    await knex.schema.createTable('incentive_tiers', (t) => {
      t.increments('id').primary();
      t.string('scope', 20).notNullable().defaultTo('global'); // reserved for future per-rep/per-month
      t.string('scope_ref', 60).nullable();                    // reserved (e.g. rep id or YYYY-MM)
      t.integer('slab_order').notNullable().defaultTo(0);       // display + apply order
      t.decimal('from_amount', 12, 2).notNullable().defaultTo(0);
      t.decimal('to_amount', 12, 2).nullable();                // null = open-ended (last slab)
      t.decimal('percent', 6, 3).notNullable().defaultTo(0);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
      t.index(['scope', 'scope_ref', 'slab_order']);
    });

    // Seed example slabs so the settings screen isn't blank on day one.
    // HR edits these to their real percentages/ranges.
    await knex('incentive_tiers').insert([
      { scope: 'global', slab_order: 1, from_amount: '0.00', to_amount: '100000.00', percent: '5.000' },
      { scope: 'global', slab_order: 2, from_amount: '100000.00', to_amount: '200000.00', percent: '3.000' },
    ]);
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('incentive_tiers');
};
