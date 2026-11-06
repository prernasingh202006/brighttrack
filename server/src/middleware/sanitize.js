// Input sanitisation:
//  - NoSQL injection: drops any key starting with '$' or containing '.'
//  - XSS: strips HTML tags from every string (passwords are left untouched)
const xss = require('xss');

const SKIP_KEYS = new Set(['password', 'confirmPassword']);
const xssOptions = { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script', 'style'] };

function clean(value, key) {
  if (typeof value === 'string') return SKIP_KEYS.has(key) ? value : xss(value, xssOptions).trim();
  if (Array.isArray(value)) return value.map((v) => clean(v));
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((k) => {
      if (k.startsWith('$') || k.includes('.')) return;
      out[k] = clean(value[k], k);
    });
    return out;
  }
  return value;
}

module.exports = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  next();
};
module.exports.clean = clean;
