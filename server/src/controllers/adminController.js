const Complaint = require('../models/Complaint');
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
    filter.$or = [{ complaintId: rx }, { location: rx }, { pole: rx }, { description: rx }];
  }
  return filter;
}

const adminView = (c) => {
  const o = c.toObject ? c.toObject() : c;
  delete o.__v;
  delete o.locationKey;
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

exports.updateStatus = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId });
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  const from = c.status;
  const to = req.body.status;
  if (from === to) throw new ApiError(400, `Complaint is already ${to}`, { code: 'NO_CHANGE' });

  c.status = to;
  c.history.push({ status: to, changedBy: req.user._id, at: new Date() });
  await c.save();
  await c.populate([{ path: 'user', select: 'name email phone' }, { path: 'history.changedBy', select: 'name' }]);
  events.emit('complaint.statusChanged', c, from, to);
  res.json({ success: true, data: { complaint: adminView(c) } });
});

exports.updateNote = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId });
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  c.adminNote = req.body.note;
  await c.save();
  await c.populate([{ path: 'user', select: 'name email phone' }, { path: 'history.changedBy', select: 'name' }]);
  res.json({ success: true, data: { complaint: adminView(c) } });
});

exports.remove = asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ complaintId: req.params.complaintId });
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  await c.deleteOne();
  res.json({ success: true, data: { deleted: c.complaintId } });
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const items = await Complaint.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(10000).populate('user', 'name email phone');
  const header = ['Complaint ID', 'Status', 'Type', 'Location', 'Pole', 'Unsafe', 'Description', 'Admin note', 'Reporter', 'Email', 'Phone', 'Created', 'Updated'];
  const rows = items.map((c) => [
    c.complaintId, c.status, c.type, c.location, c.pole, c.unsafe ? 'Yes' : 'No', c.description, c.adminNote,
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
