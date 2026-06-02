'use strict';

/**
 * Additive migration — does NOT touch or remove any existing data.
 *  - users.active      : soft deactivate (keeps history; blocks login when false)
 *  - audit_logs        : who did what (user create/edit/deactivate/delete, exports)
 */

exports.up = async function up(knex) {
  const hasActive = await knex.schema.hasColumn('users', 'active');
  if (!hasActive) {
    await knex.schema.alterTable('users', (t) => {
      t.boolean('active').notNullable().defaultTo(true);
    });
  }

  const hasAudit = await knex.schema.hasTable('audit_logs');
  if (!hasAudit) {
    await knex.schema.createTable('audit_logs', (t) => {
      t.increments('id').primary();
      t.integer('actor_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      t.string('actor_email', 190).nullable();
      t.string('action', 60).notNullable();      // e.g. user.create, user.update, user.deactivate, export
      t.string('target_type', 40).nullable();    // e.g. user
      t.string('target_id', 60).nullable();
      t.text('detail').nullable();               // JSON string with extra context
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.index(['action', 'created_at']);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
  const hasActive = await knex.schema.hasColumn('users', 'active');
  if (hasActive) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('active'));
  }
};
