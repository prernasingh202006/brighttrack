const mongoose = require('mongoose');

// A repair technician or crew that complaints can be assigned to. Technicians are managed by admins;
// they do not log in. Deactivate instead of deleting so old assignments keep making sense.
const technicianSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    phone: { type: String, trim: true },
    area: { type: String, trim: true, maxlength: 60 }, // e.g. "Andheri / Zone 3"
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Technician', technicianSchema);
