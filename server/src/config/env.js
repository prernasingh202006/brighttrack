// Loads and validates environment variables once, at startup. Fails fast on bad config.
require('dotenv').config();
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_DAYS: z.coerce.number().int().min(1).default(7),
  CLIENT_ORIGIN: z.string().min(1, 'CLIENT_ORIGIN is required'),
  COOKIE_NAME: z.string().default('bt_token'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  LOG_LEVEL: z.string().default('info'),
  API_RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(20),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  parsed.error.issues.forEach((i) => console.error(` - ${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}

const e = parsed.data;
const isProd = e.NODE_ENV === 'production';
if (isProd && e.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters in production');
  process.exit(1);
}

const sameSite = e.COOKIE_SAMESITE || (isProd ? 'none' : 'lax');
// SameSite=None is rejected by browsers unless Secure is set
const secure = sameSite === 'none' ? true : e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : isProd;

module.exports = {
  ...e,
  isProd,
  isTest: e.NODE_ENV === 'test',
  clientOrigins: e.CLIENT_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, '')),
  cookie: { sameSite, secure },
};
