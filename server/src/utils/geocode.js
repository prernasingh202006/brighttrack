// Real-place lookup so a complaint's location cannot be made-up text.
//
//  * search(q) / reverse(lat, lng) query OpenStreetMap Nominatim and return places, each with a SIGNED token.
//  * Creating a complaint requires such a token. The server verifies the signature and takes the address and
//    coordinates from inside it, so the client cannot invent or alter a location.
//
// The public Nominatim service allows ~1 request/second, needs an identifying User-Agent and forbids
// search-as-you-type, so requests are queued (>= 1.1 s apart), cached, and the UI searches on submit only.
const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('./ApiError');
const logger = require('./logger');
const { clean } = require('../middleware/sanitize');

const MAX_LABEL = 120;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

// ---------- signed location tokens (HMAC, no extra dependency) ----------
const tokenKey = () => crypto.createHash('sha256').update(`${env.JWT_SECRET}:location`).digest();
const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;
const sign = (body) => crypto.createHmac('sha256', tokenKey()).update(body).digest();

function signLocation({ label, lat, lng }, ttlMs = TOKEN_TTL_MS) {
  const body = Buffer.from(JSON.stringify({ l: label, a: round6(lat), o: round6(lng), exp: Date.now() + ttlMs })).toString('base64url');
  return `${body}.${sign(body).toString('base64url')}`;
}

/** -> { location: {label, lat, lng} } or { error: 'invalid' | 'expired' } */
function verifyLocation(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { error: 'invalid' };
  const given = Buffer.from(parts[1], 'base64url');
  const expected = sign(parts[0]);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { error: 'invalid' };
  let p;
  try {
    p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return { error: 'invalid' };
  }
  if (typeof p.exp !== 'number' || p.exp < Date.now()) return { error: 'expired' };
  const label = clean(String(p.l || '')).slice(0, MAX_LABEL);
  if (!label || !Number.isFinite(p.a) || !Number.isFinite(p.o) || Math.abs(p.a) > 90 || Math.abs(p.o) > 180) return { error: 'invalid' };
  return { location: { label, lat: p.a, lng: p.o } };
}

// ---------- Nominatim client: queue + cache ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
let chain = Promise.resolve();

function throttled(fn) {
  const run = chain.then(async () => {
    const wait = env.isTest ? 0 : Math.max(0, lastCall + MIN_INTERVAL_MS - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

const cache = new Map();
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, exp: Date.now() + CACHE_TTL_MS });
}
const clearCache = () => cache.clear();

const UNAVAILABLE = 'Address search is unavailable right now. Please try again in a moment.';

async function nominatim(path, params) {
  const url = new URL(path, `${env.geo.baseUrl}/`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const userAgent = `BrightTrack/1.0${env.geo.contact ? ` (${env.geo.contact})` : ''}`;
  try {
    const res = await throttled(() =>
      fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(7000) })
    );
    if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
    return await res.json();
  } catch (err) {
    logger.error({ err: err.message }, 'geocoder request failed');
    throw new ApiError(503, UNAVAILABLE, { code: 'GEO_UNAVAILABLE' });
  }
}

function shortLabel(displayName) {
  const parts = String(displayName || '').split(',').map((x) => x.trim()).filter(Boolean);
  while (parts.length > 1 && /^india$/i.test(parts[parts.length - 1])) parts.pop();
  const out = clean(parts.join(', '));
  return out.length > MAX_LABEL ? `${out.slice(0, MAX_LABEL - 1)}…` : out;
}

const allowed = (r) => {
  const cc = r.address && r.address.country_code;
  return !env.geo.countryCodes.length || (cc && env.geo.countryCodes.includes(String(cc).toLowerCase()));
};

function normalize(r) {
  const lat = Number(r && r.lat);
  const lng = Number(r && r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !allowed(r)) return null;
  const label = shortLabel(r.display_name);
  return label ? { label, lat: round6(lat), lng: round6(lng) } : null;
}

const withToken = (p) => ({ ...p, token: signLocation(p) });

/** Search places by text. Returns up to 6 results, each with a signed token. */
async function search(query) {
  const q = String(query).trim().replace(/\s+/g, ' ');
  const key = `s:${q.toLowerCase()}`;
  let places = cacheGet(key);
  if (!places) {
    const raw = await nominatim('/search', {
      q, format: 'jsonv2', addressdetails: 1, limit: 6, dedupe: 1, 'accept-language': 'en',
      ...(env.geo.countryCodes.length && { countrycodes: env.geo.countryCodes.join(',') }),
    });
    places = (Array.isArray(raw) ? raw : []).map(normalize).filter(Boolean);
    cacheSet(key, places);
  }
  return places.map(withToken);
}

/** Address for a GPS point. Returns one place with a signed token, or null if nothing is there. */
async function reverse(lat, lng) {
  const key = `r:${lat.toFixed(5)},${lng.toFixed(5)}`;
  let result = cacheGet(key);
  if (result === undefined) {
    const raw = await nominatim('/reverse', { lat, lon: lng, format: 'jsonv2', addressdetails: 1, zoom: 18, 'accept-language': 'en' });
    if (raw && raw.error) result = null;
    else if (raw && !allowed(raw)) throw new ApiError(400, 'That point is outside the area BrightTrack serves.', { code: 'OUT_OF_AREA' });
    else result = normalize(raw);
    cacheSet(key, result);
  }
  // The label comes from the lookup, but the point is what the user actually stood on / chose.
  return result ? withToken({ ...result, lat: round6(lat), lng: round6(lng) }) : null;
}

module.exports = { signLocation, verifyLocation, search, reverse, shortLabel, clearCache };
