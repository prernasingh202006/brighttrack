const mongoose = require('mongoose');
const { STATUSES, COMPLAINT_TYPES } = require('../constants');

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    // Internal context for admins (e.g. "Assigned to Ramesh", or the resolution note). Never sent to residents.
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

// Metadata for an attached photo. The _id is the same as the Image document that holds the bytes.
const imageMetaSchema = new mongoose.Schema(
  {
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const complaintSchema = new mongoose.Schema(
  {
    complaintId: { type: String, required: true, unique: true }, // unique index
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    // Coordinates of the verified place (about 110 m grid, or the lower-cased text for older complaints).
    // Used to group repeat reports (hotspots).
    locationKey: { type: String, index: true },
    coords: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    pole: { type: String, trim: true, maxlength: 30 },
    type: { type: String, enum: COMPLAINT_TYPES, required: true },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 400 },
    unsafe: { type: Boolean, default: false },
    status: { type: String, enum: STATUSES, default: 'Pending', index: true },
    adminNote: { type: String, trim: true, maxlength: 500 },

    // Repair workflow: Pending -> (assign technician) In Progress -> (resolution note) Resolved
    technician: { type: mongoose.Schema.Types.ObjectId, ref: 'Technician', index: true },
    assignedTo: { type: String, trim: true, maxlength: 60 }, // technician name at the time of assignment
    assignedAt: { type: Date },
    resolutionNote: { type: String, trim: true, maxlength: 500 }, // what was fixed; shown to the resident
    resolvedAt: { type: Date },
    history: { type: [historySchema], default: [] },

    // Up to MAX_IMAGES photos of the light and its surroundings (bytes are in the Image collection)
    images: { type: [imageMetaSchema], default: [] },
  },
  { timestamps: true }
);

complaintSchema.pre('validate', function setLocationKey(next) {
  const { lat, lng } = this.coords || {};
  if (Number.isFinite(lat) && Number.isFinite(lng)) this.locationKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  else if (this.location) this.locationKey = this.location.toLowerCase().replace(/\s+/g, ' ').trim();
  next();
});

complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
