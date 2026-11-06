const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

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

exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (await User.exists({ email })) {
    throw new ApiError(409, 'An account with this email already exists', { code: 'EMAIL_TAKEN' });
  }
  // Role is never read from the request: public registration always creates a resident.
  const user = await User.create({
    name,
    email,
    phone,
    role: 'resident',
    passwordHash: await User.hashPassword(password),
  });
  setSession(res, user);
  res.status(201).json({ success: true, data: { user } });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = user ? await user.comparePassword(password) : (await bcrypt.compare(password, DUMMY_HASH), false);
  if (!user || !ok) throw new ApiError(401, 'Invalid email or password', { code: 'BAD_CREDENTIALS' });
  setSession(res, user);
  res.json({ success: true, data: { user } });
});

exports.logout = (_req, res) => {
  res.clearCookie(env.COOKIE_NAME, cookieOptions());
  res.json({ success: true, data: { message: 'Logged out' } });
};

exports.me = (req, res) => res.json({ success: true, data: { user: req.user } });
