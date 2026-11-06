const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const env = require('../config/env');

const notFound = (req, _res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, { code: 'NOT_FOUND' }));

// Central error handler. Every error leaves the API in the same shape:
// { success: false, error: { message, code, details? } }
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let status = err.statusCode || err.status || 500;
  let { message, code, details } = err;

  if (err.type === 'entity.parse.failed') [status, message, code] = [400, 'Malformed JSON body', 'BAD_JSON'];
  else if (err.type === 'entity.too.large') [status, message, code] = [413, 'Request body too large', 'PAYLOAD_TOO_LARGE'];
  else if (err.code === 11000) [status, message, code] = [409, 'A record with that value already exists', 'DUPLICATE'];
  else if (err.name === 'CastError') [status, message, code] = [400, 'Invalid identifier', 'BAD_ID'];
  else if (err.name === 'ValidationError') [status, message, code] = [400, err.message, 'VALIDATION_ERROR'];

  if (status >= 500) {
    (req.log || logger).error({ err }, 'unhandled error');
    if (env.isProd) message = 'Something went wrong on our side';
  }

  res.status(status).json({
    success: false,
    error: { message: message || 'Unexpected error', code: code || 'ERROR', ...(details && { details }) },
  });
};

module.exports = { notFound, errorHandler };
