'use strict';

/**
 * Auth rework: email + password login, with email-OTP used ONLY for password
 * recovery.
 *
 * - users.password_hash : bcrypt hash, nullable (a user may exist before a
 *   password is set; login simply fails until one is set).
 * - password_resets     : one row per issued reset OTP. The OTP itself is stored
 *   bcrypt-HASHED (never plaintext), with an expiry and single-use flag.
 */

exports.up = async function up(knex) {
  const hasPw = await knex.schema.hasColumn('users', 'password_hash');
  if (!hasPw) {
    await knex.schema.alterTable('users', (t) => {
      t.string('password_hash', 255).nullable();
    });
  }

  const hasResets = await knex.schema.hasTable('password_resets');
  if (!hasResets) {
    await knex.schema.createTable('password_resets', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      t.string('otp_hash', 255).notNullable();
      t.datetime('expires_at').notNullable();
      t.boolean('used').notNullable().defaultTo(false);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.index(['user_id', 'used']);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('password_resets');
  const hasPw = await knex.schema.hasColumn('users', 'password_hash');
  if (hasPw) {
    await knex.schema.alterTable('users', (t) => {
      t.dropColumn('password_hash');
    });
  }
};
