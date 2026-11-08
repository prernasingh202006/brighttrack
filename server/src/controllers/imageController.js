const Complaint = require('../models/Complaint');
const Image = require('../models/Image');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { detectImageType } = require('../utils/imageType');
const { MAX_IMAGES } = require('../constants');

const meta = (i) => ({ id: i._id, contentType: i.contentType, size: i.size });
const UNSUPPORTED = 'Send a JPEG, PNG or WebP photo (up to 2 MB).';

// POST raw image bytes (Content-Type: image/jpeg | image/png | image/webp). Residents add photos to their own
// complaint until it is resolved.
exports.upload = asyncHandler(async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new ApiError(415, UNSUPPORTED, { code: 'UNSUPPORTED_IMAGE' });
  const type = detectImageType(buf); // from the bytes themselves, not the header the client sent
  if (!type) throw new ApiError(415, UNSUPPORTED, { code: 'UNSUPPORTED_IMAGE' });

  const c = await Complaint.findOne({ complaintId: req.params.complaintId, user: req.user._id }).select('_id status images');
  if (!c) throw new ApiError(404, 'Complaint not found', { code: 'NOT_FOUND' });
  if (c.status === 'Resolved') throw new ApiError(400, 'This complaint is resolved, so photos can no longer be added', { code: 'RESOLVED' });
  if (c.images.length >= MAX_IMAGES) throw new ApiError(400, `You can attach up to ${MAX_IMAGES} photos per complaint`, { code: 'IMAGE_LIMIT' });

  const image = await Image.create({ complaint: c._id, owner: req.user._id, contentType: type, size: buf.length, data: buf });
  // Atomic limit: the push only happens while fewer than MAX_IMAGES exist, even with parallel uploads.
  const updated = await Complaint.findOneAndUpdate(
    { _id: c._id, status: { $ne: 'Resolved' }, [`images.${MAX_IMAGES - 1}`]: { $exists: false } },
    { $push: { images: { _id: image._id, contentType: type, size: buf.length, at: image.createdAt } } },
    { new: true }
  );
  if (!updated) {
    await Image.deleteOne({ _id: image._id });
    throw new ApiError(400, `Could not add the photo: the complaint already has ${MAX_IMAGES} photos or has been resolved`, { code: 'IMAGE_LIMIT' });
  }
  res.status(201).json({ success: true, data: { image: meta(image), images: updated.images.map(meta) } });
});

// Only the resident who reported it, or an admin, can see a photo. Anyone else gets 404 (not 403).
exports.get = asyncHandler(async (req, res) => {
  const image = await Image.findById(req.params.imageId).select('+data');
  if (!image || (req.user.role !== 'admin' && !image.owner.equals(req.user._id))) {
    throw new ApiError(404, 'Photo not found', { code: 'NOT_FOUND' });
  }
  const bytes = Buffer.from(image.data);
  res.set({
    'Content-Type': image.contentType,
    'Content-Length': String(bytes.length),
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': 'inline',
    // Helmet's default (same-origin) would stop the frontend, hosted on another domain in production,
    // from showing the photo. Access is still limited to the owner and admins by the login check above.
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.send(bytes);
});

exports.remove = asyncHandler(async (req, res) => {
  const { complaintId, imageId } = req.params;
  const c = await Complaint.findOne({ complaintId, user: req.user._id }).select('_id status images');
  if (!c || !c.images.some((i) => String(i._id) === imageId)) throw new ApiError(404, 'Photo not found', { code: 'NOT_FOUND' });
  if (c.status === 'Resolved') throw new ApiError(400, 'This complaint is resolved, so its photos can no longer be changed', { code: 'RESOLVED' });
  const updated = await Complaint.findOneAndUpdate({ _id: c._id }, { $pull: { images: { _id: imageId } } }, { new: true });
  await Image.deleteOne({ _id: imageId, complaint: c._id });
  res.json({ success: true, data: { images: updated.images.map(meta) } });
});
