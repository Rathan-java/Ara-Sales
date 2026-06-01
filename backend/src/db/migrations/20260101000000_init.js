'use strict';

/**
 * Initial schema for Ara Sales. Matches the locked spec exactly:
 * 10 named tables + work_sessions (groups location pings into one trip).
 * All money fields are DECIMAL(12,2). Lat/lng are DECIMAL(10,7).
 */

exports.up = async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('name', 120).notNullable();
    t.string('email', 190).notNullable().unique();
    t.string('phone', 20);
    t.enu('role', ['admin', 'rep']).notNullable().defaultTo('rep');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('targets', (t) => {
    t.increments('id').primary();
    t.integer('rep_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.specificType('month', 'CHAR(7)').notNullable(); // YYYY-MM
    t.integer('client_target').notNullable().defaultTo(0);
    t.decimal('revenue_target', 12, 2).notNullable().defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['rep_id', 'month']);
  });

  await knex.schema.createTable('salaries', (t) => {
    t.increments('id').primary();
    t.integer('rep_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.specificType('month', 'CHAR(7)').notNullable();
    t.decimal('monthly_salary', 12, 2).notNullable().defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['rep_id', 'month']);
  });

  await knex.schema.createTable('clients', (t) => {
    t.increments('id').primary();
    t.string('name', 190).notNullable();
    t.decimal('reference_lat', 10, 7).nullable();
    t.decimal('reference_lng', 10, 7).nullable();
    t.integer('created_by_rep_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('sales_entries', (t) => {
    t.increments('id').primary();
    t.integer('rep_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('client_id').unsigned().nullable().references('id').inTable('clients').onDelete('SET NULL');
    t.string('client_name', 190).notNullable();
    t.enu('product', ['schoolmate', 'school_dm', 'general_dm', 'both']).notNullable();
    t.enu('lead_type', ['hot', 'warm', 'cold']).notNullable();
    t.decimal('amount', 12, 2).notNullable().defaultTo(0);
    t.date('sale_date').notNullable();
    t.text('notes').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['rep_id', 'sale_date']);
  });

  await knex.schema.createTable('work_sessions', (t) => {
    t.increments('id').primary();
    t.integer('rep_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.datetime('started_at').notNullable();
    t.datetime('ended_at').nullable();
    t.index(['rep_id', 'started_at']);
  });

  await knex.schema.createTable('location_pings', (t) => {
    t.increments('id').primary();
    t.integer('session_id').unsigned().notNullable().references('id').inTable('work_sessions').onDelete('CASCADE');
    t.integer('rep_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.decimal('lat', 10, 7).notNullable();
    t.decimal('lng', 10, 7).notNullable();
    t.datetime('recorded_at').notNullable();
    t.index(['rep_id', 'recorded_at']);
  });

  await knex.schema.createTable('visits', (t) => {
    t.increments('id').primary();
    t.integer('rep_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('client_id').unsigned().notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.string('visit_code', 12).notNullable();
    t.datetime('code_issued_at').notNullable();
    t.datetime('code_expires_at').notNullable();
    t.boolean('code_used').notNullable().defaultTo(false);
    t.decimal('capture_lat', 10, 7).nullable();
    t.decimal('capture_lng', 10, 7).nullable();
    t.datetime('server_timestamp').nullable();
    t.boolean('geofence_pass').nullable();
    t.boolean('mock_location_flag').nullable();
    t.enu('status', ['pass', 'flag', 'reject']).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['rep_id', 'created_at']);
  });

  await knex.schema.createTable('visit_photos', (t) => {
    t.increments('id').primary();
    t.integer('visit_id').unsigned().notNullable().references('id').inTable('visits').onDelete('CASCADE');
    t.string('file_path', 512).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('incentives', (t) => {
    t.increments('id').primary();
    t.integer('rep_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.specificType('month', 'CHAR(7)').notNullable();
    t.decimal('revenue_target', 12, 2).notNullable().defaultTo(0);
    t.decimal('achieved_amount', 12, 2).notNullable().defaultTo(0);
    t.decimal('surplus_pct', 6, 2).notNullable().defaultTo(0);
    t.decimal('monthly_salary', 12, 2).notNullable().defaultTo(0);
    t.decimal('incentive_amount', 12, 2).notNullable().defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['rep_id', 'month']);
  });

  await knex.schema.createTable('export_logs', (t) => {
    t.increments('id').primary();
    t.integer('admin_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('export_type', 60).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('export_logs');
  await knex.schema.dropTableIfExists('incentives');
  await knex.schema.dropTableIfExists('visit_photos');
  await knex.schema.dropTableIfExists('visits');
  await knex.schema.dropTableIfExists('location_pings');
  await knex.schema.dropTableIfExists('work_sessions');
  await knex.schema.dropTableIfExists('sales_entries');
  await knex.schema.dropTableIfExists('clients');
  await knex.schema.dropTableIfExists('salaries');
  await knex.schema.dropTableIfExists('targets');
  await knex.schema.dropTableIfExists('users');
};
