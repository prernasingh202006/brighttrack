const Technician = require('../models/Technician');
const Complaint = require('../models/Complaint');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { escapeRegex } = require('../utils/helpers');

const view = (t, openJobs = 0) => ({ id: t._id, name: t.name, phone: t.phone, area: t.area, active: t.active, openJobs });

async function assertNameFree(name, exceptId) {
  const clash = await Technician.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), ...(exceptId && { _id: { $ne: exceptId } }) });
  if (clash) throw new ApiError(409, 'A technician with that name already exists', { code: 'DUPLICATE', details: [{ field: 'name', message: 'A technician with that name already exists' }] });
}

// Active technicians first, each with their number of unresolved jobs (helps the admin balance the work).
exports.list = asyncHandler(async (_req, res) => {
  const [techs, open] = await Promise.all([
    Technician.find().sort({ active: -1, name: 1 }),
    Complaint.aggregate([{ $match: { technician: { $ne: null }, status: { $ne: 'Resolved' } } }, { $group: { _id: '$technician', n: { $sum: 1 } } }]),
  ]);
  const counts = new Map(open.map((o) => [String(o._id), o.n]));
  res.json({ success: true, data: { technicians: techs.map((t) => view(t, counts.get(String(t._id)) || 0)) } });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, phone, area } = req.body;
  await assertNameFree(name);
  const t = await Technician.create({ name, phone: phone || undefined, area: area || undefined });
  res.status(201).json({ success: true, data: { technician: view(t) } });
});

exports.update = asyncHandler(async (req, res) => {
  const t = await Technician.findById(req.params.technicianId);
  if (!t) throw new ApiError(404, 'Technician not found', { code: 'NOT_FOUND' });
  const { name, phone, area, active } = req.body;
  if (name !== undefined && name.toLowerCase() !== t.name.toLowerCase()) await assertNameFree(name, t._id);
  if (name !== undefined) t.name = name;
  if (phone !== undefined) t.phone = phone || undefined; // '' clears it
  if (area !== undefined) t.area = area || undefined;
  if (active !== undefined) t.active = active;
  await t.save();
  const openJobs = await Complaint.countDocuments({ technician: t._id, status: { $ne: 'Resolved' } });
  res.json({ success: true, data: { technician: view(t, openJobs) } });
});
