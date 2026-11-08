// 6-digit email verification codes. Only an HMAC of the code is stored, and wrong guesses are limited.
const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('./ApiError');
const mailer = require('./mailer');

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const UNVERIFIED_ACCOUNT_TTL_MS = 24 * 60 * 60 * 1000;

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const hashCode = (email, code) => crypto.createHmac('sha256', env.JWT_SECRET).update(`${email}:${code}`).digest('hex');

function codeMatches(user, code) {
  if (!user.verifyCodeHash) return false;
  const a = Buffer.from(user.verifyCodeHash, 'hex');
  const b = Buffer.from(hashCode(user.email, code), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Stops anyone from using the endpoints to flood an inbox.
function assertCooldown(user) {
  if (!user.verifySentAt) return;
  const waitMs = RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - user.verifySentAt.getTime());
  if (waitMs > 0) {
    throw new ApiError(429, `Please wait ${Math.ceil(waitMs / 1000)} seconds before asking for another code`, { code: 'RESEND_COOLDOWN' });
  }
}

// Creates a fresh code (invalidating any earlier one), saves it hashed, and emails it.
async function issueCode(user) {
  const code = generateCode();
  user.verifyCodeHash = hashCode(user.email, code);
  user.verifyExpiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  user.verifyAttempts = 0;
  user.verifySentAt = new Date();
  user.unverifiedExpiresAt = new Date(Date.now() + UNVERIFIED_ACCOUNT_TTL_MS);
  await user.save();
  try {
    await mailer.sendVerificationCode({ to: user.email, name: user.name, code, minutes: CODE_TTL_MINUTES });
  } catch (err) {
    user.verifySentAt = undefined; // nothing was delivered, so do not make the user wait
    await user.save();
    throw err;
  }
}

module.exports = { CODE_TTL_MINUTES, MAX_ATTEMPTS, RESEND_COOLDOWN_SECONDS, generateCode, hashCode, codeMatches, assertCooldown, issueCode };
