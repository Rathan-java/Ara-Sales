'use strict';

require('dotenv').config();

function bool(v, def = false) {
  if (v === undefined || v === '') return def;
  return String(v).toLowerCase() === 'true';
}

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ara_sales',
    // Azure Database for MySQL requires TLS. Set DB_SSL=true in prod.
    ssl: bool(process.env.DB_SSL, false),
  },

  // Number of proxies in front of the app (Azure App Service = 1). Needed so
  // express-rate-limit and req.ip see the real client IP, not the load balancer.
  trustProxy: num(process.env.TRUST_PROXY, 0),

  // Run `knex migrate:latest` automatically on boot. Handy on PaaS where there's
  // no separate release step. NEVER auto-seed in production.
  autoMigrate: bool(process.env.AUTO_MIGRATE, false),

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  otp: {
    ttlSeconds: num(process.env.OTP_TTL_SECONDS, 300),
    // Dev-only fixed OTP so the reset flow is demoable without reading email.
    devOtp: process.env.DEV_OTP || '000000',
  },

  // Auth tuning. bcrypt cost + rate-limit windows/limits for login + reset.
  auth: {
    bcryptRounds: num(process.env.BCRYPT_ROUNDS, 10),
    minPasswordLength: num(process.env.MIN_PASSWORD_LENGTH, 8),
    loginMaxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 5),
    loginWindowMinutes: num(process.env.LOGIN_WINDOW_MINUTES, 15),
    forgotMaxAttempts: num(process.env.FORGOT_MAX_ATTEMPTS, 3),
    forgotWindowMinutes: num(process.env.FORGOT_WINDOW_MINUTES, 15),
  },

  // Gmail SMTP for sending the password-reset OTP. Placeholders only in
  // .env.example; real values live in .env (gitignored).
  mail: {
    gmailUser: process.env.GMAIL_USER || '',
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
    fromName: process.env.MAIL_FROM_NAME || 'Ara Sales',
  },

  storage: {
    // 'local' (disk) for dev; 'azure' (Blob Storage) for production. The driver
    // is chosen here; call sites use a single storage interface either way.
    driver: process.env.STORAGE_DRIVER || 'local',
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
    azure: {
      // Either a full connection string, or account name + key.
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
      accountName: process.env.AZURE_STORAGE_ACCOUNT || '',
      accountKey: process.env.AZURE_STORAGE_KEY || '',
      container: process.env.AZURE_STORAGE_CONTAINER || 'visit-photos',
    },
  },

  incentive: {
    multiplier: num(process.env.INCENTIVE_MULTIPLIER, 1),
    capEnabled: bool(process.env.INCENTIVE_CAP_ENABLED, false),
    maxIncentiveAmount:
      process.env.INCENTIVE_MAX_AMOUNT === undefined || process.env.INCENTIVE_MAX_AMOUNT === ''
        ? null
        : num(process.env.INCENTIVE_MAX_AMOUNT, null),
  },

  visit: {
    geofenceRadiusM: num(process.env.GEOFENCE_RADIUS_M, 150),
    codeTtlSeconds: num(process.env.VISIT_CODE_TTL_SECONDS, 90),
  },

  // Visit-photo downscaling before storage. Keeps photos small (~40-120 KB) so
  // MySQL-backed storage stays cheap. Tune via env.
  image: {
    maxDimension: num(process.env.PHOTO_MAX_DIMENSION, 1080), // longest side, px
    jpegQuality: num(process.env.PHOTO_JPEG_QUALITY, 60), // 0-100
  },

  // Visit-photo retention. After this many days a photo's file + visit_photos
  // row are deleted to cap storage/cost; the visit audit record is KEPT.
  // Default 60 days (~2 months). Set 0 to disable cleanup entirely.
  retention: {
    photoDays: num(process.env.PHOTO_RETENTION_DAYS, 60),
    // Run the cleanup automatically in-process on this interval (hours).
    // Set 0 to disable the in-process scheduler (e.g. when using external cron).
    sweepIntervalHours: num(process.env.RETENTION_SWEEP_HOURS, 24),
  },
};

module.exports = config;
