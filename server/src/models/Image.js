const mongoose = require('mongoose');

// Photo bytes live in their own collection so complaint documents stay small and the bytes are only
// loaded when an image is actually requested (`data` is select:false). The complaint keeps a small
// metadata entry (same _id) in complaint.images.
const imageSchema = new mongoose.Schema({
  complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the resident who reported it
  contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Image', imageSchema);
