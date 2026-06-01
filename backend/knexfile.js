'use strict';

require('dotenv').config();

// Azure Database for MySQL requires TLS. When DB_SSL=true we enable it; the
// public CA chain validates Azure's cert without bundling a .pem.
const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';

/**
 * The DB connection can be supplied two ways (use whichever your platform prefers):
 *
 *   A) A single connection string:
 *        DATABASE_URL=mysql://user:password@host:3306/ara_sales?ssl=true
 *
 *   B) Discrete variables (default):
 *        DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL
 *
 * If DATABASE_URL is set it wins; otherwise the discrete vars are used. The
 * 127.0.0.1 fallback only applies for local dev when nothing is provided.
 */
function buildConnection() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.JAWSDB_URL;
  if (url) {
    const u = new URL(url);
    const sslFromUrl = u.searchParams.get('ssl') === 'true' || u.searchParams.get('sslmode') === 'require';
    return {
      host: decodeURIComponent(u.hostname),
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || 'ara_sales',
      decimalNumbers: false,
      timezone: 'Z',
      ...(sslEnabled || sslFromUrl ? { ssl: { rejectUnauthorized: true } } : {}),
    };
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ara_sales',
    // Keep DECIMAL columns as strings so we never lose money precision to floats.
    decimalNumbers: false,
    timezone: 'Z',
    ...(sslEnabled ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

const base = {
  client: 'mysql2',
  connection: buildConnection(),
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './src/db/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './src/db/seeds',
  },
};

module.exports = {
  development: base,
  test: base,
  production: base,
};
