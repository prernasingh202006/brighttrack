const Complaint = require('../models/Complaint');
const Technician = require('../models/Technician');
const Image = require('../models/Image');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { escapeRegex, csvCell } = require('../utils/helpers');
const events = require('../utils/notifier');

function buildFilter({ search, status, unsafe }) {
  const filter = {};
  if (status) filter.status = status;
  if (unsafe) filter.unsafe = unsafe === 'true';
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i'); // escaped: user input is never a regex
    filter.$or = [{ complaintId: rx }, { location: rx }, { pole: rx }, { description: rx }, { assignedTo: rx }];
  }
  return filter;
}

const adminView = (c) => {
  const o = c.toObject ? c.toObject() : c;
  delete o.__v;
  delete o.locationKey;
  o.images = (o.images || []).map((i) => ({ id: i._id, contentType: i.contentType, size: i.size }));
  return o;
};

exports.list = asyncHandler(async (req, res) => {
  const { sort, order, page, limit } = req.query;
  const filter = buildFilter(req.query);
  const [total, items] = await Promise.all([
    Complaint.countDocuments(filter),
    Complaint.find(filter)
      .sort({ [sort]: order === 'asc' ? 1 : -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email phone')
      .populate('history.changedBy', 'name'),
  ]);
  res.json({
    success: true,
    data: { complaints: items.map(adminView) },
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

const POPULATE = [
  { path: 'user', select: 'name email phone' },
  { path: 'history.changedBy', select: 'name' },
];

// Status changes follow the repair workflow:
//   Pending -> In Progress  needs a technician (use the assign endpoint, which does this for you)
//   any     -> Resolved     needs a technician AND a resolution note saying what was fixed
//   Resolved -> anything    reopens the complaint and clears the resolution
exports.updateStatus = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId });
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  const from = c.status;
  const { status: to, resolutionNote } = req.body;
  if (from === to) throw new ApiError(400, `Complaint is already ${to}`, { code: 'NO_CHANGE' });

  if ((to === 'In Progress' || to === 'Resolved') && !c.assignedTo) {
    throw new ApiError(400, 'Assign a technician before starting or finishing the work', { code: 'NEEDS_TECHNICIAN' });
  }

  const at = new Date();
  if (to === 'Resolved') {
    c.resolutionNote = resolutionNote;
    c.resolvedAt = at;
  } else if (from === 'Resolved') {
    c.resolutionNote = undefined; // reopened: the old resolution no longer applies (it stays in history)
    c.resolvedAt = undefined;
  }
  c.status = to;
  c.history.push({ status: to, changedBy: req.user._id, at, note: to === 'Resolved' ? resolutionNote : from === 'Resolved' ? 'Reopened' : undefined });
  await c.save();
  await c.populate(POPULATE);
  events.emit('complaint.statusChanged', c, from, to);
  res.json({ success: true, data: { complaint: adminView(c) } });
});

// Assign (or reassign) a technician chosen from the managed list. A Pending complaint automatically becomes In Progress.
exports.assign = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId });
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  if (c.status === 'Resolved') {
    throw new ApiError(400, 'This complaint is already resolved. Reopen it before assigning someone', { code: 'ALREADY_RESOLVED' });
  }
  const tech = await Technician.findById(req.body.technicianId);
  if (!tech || !tech.active) {
    throw new ApiError(400, 'That technician is not available. Choose someone from the list', { code: 'TECHNICIAN_UNAVAILABLE' });
  }
  const previous = c.assignedTo;
  const from = c.status;
  const at = new Date();

  c.technician = tech._id;
  c.assignedTo = tech.name; // name as it was when the job was assigned
  c.assignedAt = at;
  if (c.status === 'Pending') {
    c.status = 'In Progress';
    c.history.push({ status: 'In Progress', changedBy: req.user._id, at, note: `Assigned to ${tech.name}` });
  }
  await c.save();
  await c.populate(POPULATE);
  events.emit('complaint.assigned', c, previous);
  if (from !== c.status) events.emit('complaint.statusChanged', c, from, c.status);
  res.json({ success: true, data: { complaint: adminView(c) } });
});

exports.updateNote = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId });
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  c.adminNote = req.body.note;
  await c.save();
  await c.populate(POPULATE);
  res.json({ success: true, data: { complaint: adminView(c) } });
});

exports.remove = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId });
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  await Promise.all([c.deleteOne(), Image.deleteMany({ complaint: c._id })]); // photos go with the complaint
  res.json({ success: true, data: { deleted: c.complaintId } });
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const items = await Complaint.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(10000).populate('user', 'name email phone');
  const header = ['Complaint ID', 'Status', 'Type', 'Location', 'Pole', 'Unsafe', 'Description', 'Latitude', 'Longitude', 'Photos', 'Admin note', 'Assigned to', 'Resolution note', 'Resolved', 'Reporter', 'Email', 'Phone', 'Created', 'Updated'];
  const rows = items.map((c) => [
    c.complaintId, c.status, c.type, c.location, c.pole, c.unsafe ? 'Yes' : 'No', c.description,
    c.coords && c.coords.lat, c.coords && c.coords.lng, c.images ? c.images.length : 0, c.adminNote,
    c.assignedTo, c.resolutionNote, c.resolvedAt && c.resolvedAt.toISOString(),
    c.user && c.user.name, c.user && c.user.email, c.user && c.user.phone,
    c.createdAt.toISOString(), c.updatedAt.toISOString(),
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="brighttrack-complaints-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  res.send(String.fromCharCode(0xfeff) + csv);
});

// Locations reported more than once (grouped on the normalized locationKey).
exports.hotspots = asyncHandler(async (_req, res) => {
  const hotspots = await Complaint.aggregate([
    {
      $group: {
        _id: '$locationKey',
        location: { $first: '$location' },
        count: { $sum: 1 },
        open: { $sum: { $cond: [{ $ne: ['$status', 'Resolved'] }, 1, 0] } },
        lastReportedAt: { $max: '$createdAt' },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1, lastReportedAt: -1 } },
    { $limit: 20 },
    { $project: { _id: 0, location: 1, count: 1, open: 1, lastReportedAt: 1 } },
  ]);
  res.json({ success: true, data: { hotspots } });
});
