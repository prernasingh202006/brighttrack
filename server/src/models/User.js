const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../constants');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'resident' },
  createdAt: { type: Date, default: Date.now },

  // Email verification. `emailVerified` has NO default on purpose: accounts created before this
  // feature (field missing) count as verified; sign-up sets it to false explicitly.
  emailVerified: { type: Boolean },
  verifyCodeHash: { type: String, select: false }, // HMAC of the 6-digit code, never the code itself
  verifyExpiresAt: { type: Date, select: false },
  verifyAttempts: { type: Number, select: false },
  verifySentAt: { type: Date, select: false },
  // Unverified accounts delete themselves (TTL index) so nobody can squat on someone else's email.
  unverifiedExpiresAt: { type: Date },
});

userSchema.index({ unverifiedExpiresAt: 1 }, { expireAfterSeconds: 0 });

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 12);
userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.verifyCodeHash;
    delete ret.verifyExpiresAt;
    delete ret.verifyAttempts;
    delete ret.verifySentAt;
    delete ret.unverifiedExpiresAt;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
