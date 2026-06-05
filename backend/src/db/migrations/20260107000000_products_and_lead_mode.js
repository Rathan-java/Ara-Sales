'use strict';

/**
 * Products become a managed list, and sales gain a "lead_mode" field.
 *
 * Changes (all data-preserving):
 *  - NEW table `products` (id, name UNIQUE, created_at) seeded with "SchoolMate".
 *  - sales_entries.product : ENUM('schoolmate','school_dm','general_dm','both')
 *      -> VARCHAR(190) holding the product NAME (so deleting a product never
 *         breaks historical sales). Existing rows are all mapped to "SchoolMate"
 *         (the only real product; the old enum values were really lead modes).
 *  - sales_entries.lead_mode : NEW VARCHAR — how the sale was made. Backfilled
 *      from the old product enum:
 *        schoolmate  -> 'platform'
 *        school_dm   -> 'specific_dm'
 *        general_dm  -> 'general_dm'
 *        both        -> 'specific_dm'
 *      Allowed values: platform | specific_dm | general_dm | direct_visit.
 */

exports.up = async function up(knex) {
  // 1) products table
  const hasProducts = await knex.schema.hasTable('products');
  if (!hasProducts) {
    await knex.schema.createTable('products', (t) => {
      t.increments('id').primary();
      t.string('name', 190).notNullable().unique();
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
  const seed = await knex('products').where({ name: 'SchoolMate' }).first();
  if (!seed) await knex('products').insert({ name: 'SchoolMate' });

  // 2) add lead_mode column (nullable first, so we can backfill)
  const hasLeadMode = await knex.schema.hasColumn('sales_entries', 'lead_mode');
  if (!hasLeadMode) {
    await knex.schema.alterTable('sales_entries', (t) => {
      t.string('lead_mode', 40).nullable();
    });
  }

  // 3) backfill lead_mode from the old product enum BEFORE we change product
  await knex('sales_entries').where({ product: 'schoolmate' }).update({ lead_mode: 'platform' });
  await knex('sales_entries').where({ product: 'school_dm' }).update({ lead_mode: 'specific_dm' });
  await knex('sales_entries').where({ product: 'general_dm' }).update({ lead_mode: 'general_dm' });
  await knex('sales_entries').where({ product: 'both' }).update({ lead_mode: 'specific_dm' });
  // any null leftovers default to platform
  await knex('sales_entries').whereNull('lead_mode').update({ lead_mode: 'platform' });

  // 4) convert product ENUM -> VARCHAR and set every existing row to 'SchoolMate'.
  //    Use a raw MODIFY so MySQL drops the enum constraint.
  await knex.raw("ALTER TABLE sales_entries MODIFY COLUMN product VARCHAR(190) NOT NULL DEFAULT 'SchoolMate'");
  await knex('sales_entries').update({ product: 'SchoolMate' });
};

exports.down = async function down(knex) {
  const hasLeadMode = await knex.schema.hasColumn('sales_entries', 'lead_mode');
  if (hasLeadMode) {
    await knex.schema.alterTable('sales_entries', (t) => t.dropColumn('lead_mode'));
  }
  // Restore the old enum (best-effort; maps everything to 'schoolmate').
  await knex.raw(
    "ALTER TABLE sales_entries MODIFY COLUMN product "
    + "ENUM('schoolmate','school_dm','general_dm','both') NOT NULL DEFAULT 'schoolmate'",
  );
  await knex.schema.dropTableIfExists('products');
};
