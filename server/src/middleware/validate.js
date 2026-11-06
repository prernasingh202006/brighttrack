const ApiError = require('../utils/ApiError');

// validate(schema, 'body' | 'query' | 'params') - replaces the source with the parsed (typed, trimmed) data.
module.exports = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.') || source, message: i.message }));
    return next(new ApiError(400, details[0].message, { code: 'VALIDATION_ERROR', details }));
  }
  req[source] = result.data;
  return next();
};
