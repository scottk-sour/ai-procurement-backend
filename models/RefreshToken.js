import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  userType: {
    type: String,
    enum: ['user', 'vendor', 'admin'],
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  createdByIp: {
    type: String,
    required: true
  },
  revoked: {
    type: Boolean,
    default: false
  },
  revokedAt: {
    type: Date,
    default: null
  },
  revokedByIp: {
    type: String,
    default: null
  },
  revokedReason: {
    type: String,
    default: null
  },
  replacedByToken: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Automatically delete expired tokens (cleanup job)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
refreshTokenSchema.methods.isExpired = function() {
  return Date.now() >= this.expiresAt;
};

refreshTokenSchema.methods.isActive = function() {
  return !this.revoked && !this.isExpired();
};

// Static methods
refreshTokenSchema.statics.revokeToken = async function(token, revokedByIp, reason) {
  const refreshToken = await this.findOne({ token });

  if (!refreshToken) {
    throw new Error('Token not found');
  }

  if (!refreshToken.isActive()) {
    throw new Error('Token already expired or revoked');
  }

  refreshToken.revoked = true;
  refreshToken.revokedAt = Date.now();
  refreshToken.revokedByIp = revokedByIp;
  refreshToken.revokedReason = reason || 'User requested';

  await refreshToken.save();

  return refreshToken;
};

refreshTokenSchema.statics.revokeAllUserTokens = async function(userId, revokedByIp, reason) {
  const result = await this.updateMany(
    { userId, revoked: false },
    {
      $set: {
        revoked: true,
        revokedAt: Date.now(),
        revokedByIp,
        revokedReason: reason || 'Revoke all tokens'
      }
    }
  );

  return result;
};

refreshTokenSchema.statics.revokeAllVendorTokens = async function(vendorId, revokedByIp, reason) {
  const result = await this.updateMany(
    { vendorId, revoked: false },
    {
      $set: {
        revoked: true,
        revokedAt: Date.now(),
        revokedByIp,
        revokedReason: reason || 'Revoke all tokens'
      }
    }
  );

  return result;
};

refreshTokenSchema.statics.cleanupExpiredTokens = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: Date.now() }
  });

  return result.deletedCount;
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;
