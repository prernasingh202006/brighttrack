const mongoose = require('mongoose');
const { STATUSES, COMPLAINT_TYPES } = require('../constants');

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    complaintId: { type: String, required: true, unique: true }, // unique index
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    // Lower-cased, whitespace-collapsed location used to group repeat reports (hotspots)
    locationKey: { type: String, index: true },
    pole: { type: String, trim: true, maxlength: 30 },
    type: { type: String, enum: COMPLAINT_TYPES, required: true },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 400 },
    unsafe: { type: Boolean, default: false },
    status: { type: String, enum: STATUSES, default: 'Pending', index: true },
    adminNote: { type: String, trim: true, maxlength: 500 },
    history: { type: [historySchema], default: [] },

    // FUTURE SCOPE HOOKS (not exposed by the API yet):
    // image upload -> store storage keys/URLs here
    attachments: { type: [{ url: String, key: String }], default: undefined, select: false },
    // GPS capture / map view -> lat/lng captured by the client; add a 2dsphere index when used
    coords: { type: { lat: Number, lng: Number }, default: undefined, select: false },
  },
  { timestamps: true }
);

complaintSchema.pre('validate', function setLocationKey(next) {
  if (this.location) this.locationKey = this.location.toLowerCase().replace(/\s+/g, ' ').trim();
  next();
});

complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
