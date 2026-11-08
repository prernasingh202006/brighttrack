const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const mongoose = require('mongoose');

const env = require('./config/env');
const logger = require('./utils/logger');
const sanitize = require('./middleware/sanitize');
const { apiLimiter, csrfGuard } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY_HOPS); // behind Render/Vercel/NGINX: correct client IP for rate limiting
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.clientOrigins.includes(origin)), // only the frontend origin
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
    })
  );
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(express.json({ limit: '10kb' })); // request body size limit
  app.use(cookieParser());
  app.use(sanitize);

  app.get('/api/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ success: up, data: { status: up ? 'ok' : 'degraded', db: up ? 'up' : 'down', uptime: process.uptime() } });
  });

  app.use('/api', apiLimiter, csrfGuard, routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
