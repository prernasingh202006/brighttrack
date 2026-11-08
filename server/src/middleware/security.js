const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const handler = (_req, res) =>
  res.status(429).json({
    success: false,
    error: { message: 'Too many requests. Please try again in a few minutes.', code: 'RATE_LIMITED' },
  });

const make = (opts) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler,
    skip: () => env.isTest,
    ...opts,
  });

const apiLimiter = make({ windowMs: 15 * 60 * 1000, limit: env.API_RATE_LIMIT_MAX });
// Login: only failed attempts count. Register: every attempt counts.
const loginLimiter = make({ windowMs: 15 * 60 * 1000, limit: env.AUTH_RATE_LIMIT_MAX, skipSuccessfulRequests: true });
const registerLimiter = make({ windowMs: 60 * 60 * 1000, limit: env.AUTH_RATE_LIMIT_MAX });
// Email codes: the per-account lockout (5 wrong tries) is the real brake; these only cap raw request volume.
const verifyLimiter = make({ windowMs: 15 * 60 * 1000, limit: env.AUTH_RATE_LIMIT_MAX * 2 });
const resendLimiter = make({ windowMs: 60 * 60 * 1000, limit: env.AUTH_RATE_LIMIT_MAX });
// Address search shares one public OpenStreetMap service: keep each client well under its 1 req/s policy.
const geoLimiter = make({ windowMs: 60 * 1000, limit: 20 });
const uploadLimiter = make({ windowMs: 60 * 60 * 1000, limit: 60 });

// CSRF defence in depth: cookies are SameSite-restricted/CORS-limited, and every state-changing
// request must also carry a custom header, which cross-site forms cannot set.
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const csrfGuard = (req, _res, next) => {
  if (SAFE.has(req.method) || req.get('x-requested-with') === 'XMLHttpRequest') return next();
  return next(new ApiError(403, 'Missing X-Requested-With header', { code: 'CSRF' }));
};

module.exports = { apiLimiter, loginLimiter, registerLimiter, verifyLimiter, resendLimiter, geoLimiter, uploadLimiter, csrfGuard };
