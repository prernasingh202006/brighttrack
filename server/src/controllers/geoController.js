const geocode = require('../utils/geocode');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const ATTRIBUTION = '© OpenStreetMap contributors';

// Text search. The UI calls this on "Search" / Enter, never on every keystroke (Nominatim policy).
exports.search = asyncHandler(async (req, res) => {
  const results = await geocode.search(req.query.q);
  res.json({ success: true, data: { results }, meta: { attribution: ATTRIBUTION } });
});

// "Use my current location": the browser sends GPS coordinates, we turn them into an address.
exports.reverse = asyncHandler(async (req, res) => {
  const place = await geocode.reverse(req.query.lat, req.query.lng);
  if (!place) throw new ApiError(404, 'We could not find an address at that point. Try searching for the place instead.', { code: 'NO_ADDRESS' });
  res.json({ success: true, data: { place }, meta: { attribution: ATTRIBUTION } });
});
