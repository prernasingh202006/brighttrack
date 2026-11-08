const Complaint = require('../models/Complaint');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { generateComplaintId } = require('../utils/helpers');
const events = require('../utils/notifier');
const geocode = require('../utils/geocode');

// ---- Serialisers: decide exactly which fields each audience may see ----
const historyPublic = (h) => h.map(({ status, at }) => ({ status, at }));
const imagesView = (images = []) => images.map((i) => ({ id: i._id, contentType: i.contentType, size: i.size }));

const ownerView = (c) => ({
  complaintId: c.complaintId,
  location: c.location,
  coords: c.coords && Number.isFinite(c.coords.lat) ? { lat: c.coords.lat, lng: c.coords.lng } : undefined,
  pole: c.pole,
  type: c.type,
  description: c.description,
  unsafe: c.unsafe,
  images: imagesView(c.images), // photos are private: only the resident and admins can open them
  status: c.status,
  assignedTo: c.assignedTo, // the resident may see who is handling their complaint
  resolutionNote: c.resolutionNote,
  resolvedAt: c.resolvedAt,
  history: historyPublic(c.history),
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const publicView = (c) => ({
  complaintId: c.complaintId,
  location: c.location,
  type: c.type,
  status: c.status,
  // What was done is public so anyone holding the ID can see the fault was really fixed.
  // The technician's name is NOT public.
  resolutionNote: c.resolutionNote,
  resolvedAt: c.resolvedAt,
  history: historyPublic(c.history),
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

exports.create = asyncHandler(async (req, res) => {
  const { locationToken, pole, type, description, unsafe } = req.body;
  // The address and coordinates come from the server-signed token, never from client-typed text.
  const verified = geocode.verifyLocation(locationToken);
  if (verified.error) {
    const message =
      verified.error === 'expired'
        ? 'Your selected location has expired. Please search for it again.'
        : 'Choose a real location from the search results.';
    throw new ApiError(400, message, { code: 'VALIDATION_ERROR', details: [{ field: 'locationToken', message }] });
  }
  const { label, lat, lng } = verified.location;
  let complaint;
  for (let attempt = 0; attempt < 5 && !complaint; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      complaint = await Complaint.create({
        complaintId: generateComplaintId(),
        user: req.user._id,
        location: label,
        coords: { lat, lng },
        pole,
        type,
        description,
        unsafe,
        status: 'Pending',
        history: [{ status: 'Pending', changedBy: req.user._id, at: new Date() }],
      });
    } catch (err) {
      if (!(err.code === 11000 && err.keyPattern && err.keyPattern.complaintId)) throw err;
    }
  }
  if (!complaint) throw new ApiError(503, 'Could not allocate a complaint ID, please retry');
  events.emit('complaint.created', complaint);
  res.status(201).json({ success: true, data: { complaint: ownerView(complaint) } });
});

// Only ever queries by the authenticated user's id - never trusts a client-supplied user.
exports.listMine = asyncHandler(async (req, res) => {
  const items = await Complaint.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: { complaints: items.map(ownerView) } });
});

// Owner-only detail. A complaint owned by someone else returns 404 (not 403) so IDs cannot be probed.
exports.getMine = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId, user: req.user._id });
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  res.json({ success: true, data: { complaint: ownerView(c) } });
});

exports.track = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId });
  if (!c) throw new ApiError(404, 'No complaint found with that ID', { code: 'NOT_FOUND' });
  res.json({ success: true, data: { complaint: publicView(c) } });
});

// Public: location, problem and status only. Never the reporter or the complaint ID.
exports.recent = asyncHandler(async (_req, res) => {
  const items = await Complaint.find().sort({ createdAt: -1 }).limit(8).select('location type status createdAt -_id').lean();
  res.json({ success: true, data: { complaints: items } });
});

exports.stats = asyncHandler(async (_req, res) => {
  const [byStatus, unsafeOpen] = await Promise.all([
    Complaint.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Complaint.countDocuments({ unsafe: true, status: { $ne: 'Resolved' } }),
  ]);
  const get = (s) => (byStatus.find((x) => x._id === s) || { n: 0 }).n;
  const pending = get('Pending');
  const inProgress = get('In Progress');
  const resolved = get('Resolved');
  res.json({
    success: true,
    data: { total: pending + inProgress + resolved, pending, inProgress, resolved, unsafeOpen },
  });
});

exports.serializers = { ownerView, publicView };
