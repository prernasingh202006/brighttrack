// Loads and validates environment variables once, at startup. Fails fast on bad config.
require('dotenv').config();
const { z } = require('zod');

// dotenv gives '' for "KEY=" lines; treat that as "not set".
const optional = (type) => z.preprocess((v) => (v === '' ? undefined : v), type.optional());

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
  // How many reverse proxies sit in front of the API (used to find each visitor's real IP for rate limiting).
  // Render alone = 1 (default). Vercel forwarding /api to Render = 2.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  // DNS check at sign-up (domain must be able to receive mail). Default: on, except in tests.
  EMAIL_DNS_CHECK: z.enum(['true', 'false']).optional(),

  // Sign-up email verification. Real emails go out through Brevo's HTTPS API (free plan: 300/day).
  // MAIL_PROVIDER=console prints the code in the server terminal instead (local testing only).
  MAIL_PROVIDER: optional(z.enum(['brevo', 'console'])),
  BREVO_API_KEY: optional(z.string()),
  MAIL_FROM_EMAIL: optional(z.string().email()), // must be a sender you verified in Brevo
  MAIL_FROM_NAME: z.string().default('BrightTrack'),

  // Address search (OpenStreetMap Nominatim). The public service requires an identifying contact.
  GEO_CONTACT: z.string().default(''),
  GEO_COUNTRY_CODES: z.string().default('in'), // comma separated ISO codes; empty = anywhere
  NOMINATIM_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
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

// Which email sender is active. 'none' = sign-ups are refused until one is configured.
let mailProvider = 'none';
if (e.NODE_ENV === 'test') mailProvider = 'memory';
else if (e.BREVO_API_KEY && e.MAIL_FROM_EMAIL) mailProvider = 'brevo';
else if (e.MAIL_PROVIDER === 'console' && !isProd) mailProvider = 'console';
if (isProd && mailProvider !== 'brevo') {
  console.error('In production set BREVO_API_KEY and MAIL_FROM_EMAIL so sign-up verification emails can be sent.');
  process.exit(1);
}
if (mailProvider === 'none') {
  console.warn('[email] Not configured: new sign-ups are refused until BREVO_API_KEY + MAIL_FROM_EMAIL are set (or MAIL_PROVIDER=console for local testing).');
}

const sameSite = e.COOKIE_SAMESITE || (isProd ? 'none' : 'lax');
// SameSite=None is rejected by browsers unless Secure is set
const secure = sameSite === 'none' ? true : e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : isProd;

module.exports = {
  ...e,
  isProd,
  isTest: e.NODE_ENV === 'test',
  emailDnsCheck: e.EMAIL_DNS_CHECK ? e.EMAIL_DNS_CHECK === 'true' : e.NODE_ENV !== 'test',
  clientOrigins: e.CLIENT_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, '')),
  cookie: { sameSite, secure },
  mail: { provider: mailProvider, brevoKey: e.BREVO_API_KEY, fromEmail: e.MAIL_FROM_EMAIL, fromName: e.MAIL_FROM_NAME },
  geo: {
    contact: e.GEO_CONTACT,
    baseUrl: e.NOMINATIM_URL.replace(/\/$/, ''),
    countryCodes: e.GEO_COUNTRY_CODES.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean),
  },
};
