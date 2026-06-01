'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const routes = require('./routes');
const { storage } = require('./storage');
const { notFoundHandler, errorHandler } = require('./middleware/error');

function createApp() {
  const app = express();

  // Behind Azure App Service / any reverse proxy: trust the proxy so req.ip and
  // the rate-limiter see the real client IP, and secure cookies/HTTPS work.
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // Security headers. crossOriginResourcePolicy relaxed so images/photos can be
  // embedded by the web admin on a different origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (config.env !== 'test') app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

  // Serve stored photos locally ONLY when using the local-disk driver. With the
  // Azure driver, photos are served directly from Blob Storage URLs.
  if (!storage.isRemote) {
    app.use('/uploads', express.static(path.resolve(config.storage.uploadDir)));
  }

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
