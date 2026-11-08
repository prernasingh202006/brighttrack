const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { domainCanReceiveMail, domainOf, MSG_NO_MAIL } = require('../utils/emailCheck');
const mailer = require('../utils/mailer');
const verification = require('../utils/verification');

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.cookie.secure,
  sameSite: env.cookie.sameSite,
  path: '/',
});

function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: `${env.JWT_EXPIRES_DAYS}d`,
  });
  res.cookie(env.COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: env.JWT_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });
}

// A real bcrypt hash (computed once) so login timing is similar when the email does not exist.
const bcrypt = require('bcryptjs');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const emailNotConfigured = () => new ApiError(503, 'Email sending is not set up on this server yet, so new accounts cannot be created. Please contact the administrator.', {
  code: 'EMAIL_NOT_CONFIGURED',
});

// Sign-up creates an UNVERIFIED account and emails a 6-digit code. There is no session until the code is
// entered (POST /auth/verify-email), so a made-up address can never get in.
exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!mailer.isConfigured()) throw emailNotConfigured();
  // The domain must exist and accept mail (DNS lookup). Catches typos like "gmial.co" and invented domains.
  if (env.emailDnsCheck && !(await domainCanReceiveMail(domainOf(email)))) {
    throw new ApiError(400, MSG_NO_MAIL, {
      code: 'VALIDATION_ERROR',
      details: [{ field: 'email', message: MSG_NO_MAIL }],
    });
  }

  let user = await User.findOne({ email }).select('+verifySentAt');
  if (user && user.emailVerified !== false) {
    throw new ApiError(409, 'An account with this email already exists', { code: 'EMAIL_TAKEN' });
  }
  if (user) {
    // An earlier sign-up for this address was never verified. Let the next sign-up take it over
    // (so nobody can lock a real owner out), but not faster than the resend cooldown.
    verification.assertCooldown(user);
  } else {
    user = new User({ email });
  }
  // Role is never read from the request: public registration always creates a resident.
  user.name = name;
  user.phone = phone;
  user.role = 'resident';
  user.emailVerified = false;
  user.passwordHash = await User.hashPassword(password);
  await verification.issueCode(user);

  res.status(201).json({
    success: true,
    data: {
      needsVerification: true,
      email,
      expiresInMinutes: verification.CODE_TTL_MINUTES,
      resendAfterSeconds: verification.RESEND_COOLDOWN_SECONDS,
    },
  });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const user = await User.findOne({ email }).select('+verifyCodeHash +verifyExpiresAt +verifyAttempts');
  if (!user) throw new ApiError(400, 'That code is not valid. Request a new one.', { code: 'CODE_INVALID' });
  if (user.emailVerified !== false) {
    throw new ApiError(400, 'This email is already verified. Please log in.', { code: 'ALREADY_VERIFIED' });
  }
  if (!user.verifyCodeHash || !user.verifyExpiresAt || user.verifyExpiresAt < new Date()) {
    throw new ApiError(400, 'That code has expired. Request a new one.', { code: 'CODE_EXPIRED' });
  }
  if ((user.verifyAttempts || 0) >= verification.MAX_ATTEMPTS) {
    throw new ApiError(429, 'Too many wrong attempts. Request a new code.', { code: 'TOO_MANY_ATTEMPTS' });
  }

  if (!verification.codeMatches(user, code)) {
    user.verifyAttempts = (user.verifyAttempts || 0) + 1;
    await user.save();
    const left = verification.MAX_ATTEMPTS - user.verifyAttempts;
    if (left <= 0) throw new ApiError(429, 'Too many wrong attempts. Request a new code.', { code: 'TOO_MANY_ATTEMPTS' });
    throw new ApiError(400, `Incorrect code. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`, { code: 'CODE_INVALID' });
  }

  // Success: the code is single-use and the account stops being auto-deleted.
  user.emailVerified = true;
  user.verifyCodeHash = undefined;
  user.verifyExpiresAt = undefined;
  user.verifyAttempts = undefined;
  user.verifySentAt = undefined;
  user.unverifiedExpiresAt = undefined;
  await user.save();
  setSession(res, user);
  res.json({ success: true, data: { user } });
});

// Always answers the same way, so it cannot be used to discover which emails have accounts.
exports.resendCode = asyncHandler(async (req, res) => {
  if (!mailer.isConfigured()) throw emailNotConfigured();
  const user = await User.findOne({ email: req.body.email }).select('+verifySentAt');
  if (user && user.emailVerified === false) {
    verification.assertCooldown(user);
    await verification.issueCode(user);
  }
  res.json({
    success: true,
    data: {
      message: 'If that email is waiting to be verified, a new code is on its way.',
      resendAfterSeconds: verification.RESEND_COOLDOWN_SECONDS,
    },
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = user ? await user.comparePassword(password) : (await bcrypt.compare(password, DUMMY_HASH), false);
  if (!user || !ok) throw new ApiError(401, 'Invalid email or password', { code: 'BAD_CREDENTIALS' });
  // Accounts created before verification existed have no flag (= verified); new sign-ups are false until confirmed.
  if (user.emailVerified === false) {
    throw new ApiError(403, 'Please verify your email before logging in. We can send you a new code.', { code: 'EMAIL_NOT_VERIFIED' });
  }
  setSession(res, user);
  res.json({ success: true, data: { user } });
});

exports.logout = (_req, res) => {
  res.clearCookie(env.COOKIE_NAME, cookieOptions());
  res.json({ success: true, data: { message: 'Logged out' } });
};

exports.me = (req, res) => res.json({ success: true, data: { user: req.user } });
