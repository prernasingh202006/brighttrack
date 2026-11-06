const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Reads the JWT from the httpOnly cookie and loads the user fresh from the DB,
// so role changes and deleted accounts take effect immediately.
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = req.cookies && req.cookies[env.COOKIE_NAME];
  if (!token) throw new ApiError(401, 'Please log in to continue', { code: 'UNAUTHENTICATED' });

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Your session has expired. Please log in again', { code: 'UNAUTHENTICATED' });
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'Account no longer exists', { code: 'UNAUTHENTICATED' });
  req.user = user;
  next();
});

const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role)
    ? next()
    : next(new ApiError(403, 'You do not have permission to do this', { code: 'FORBIDDEN' }));

module.exports = { authenticate, requireRole };
