import mongoose from 'mongoose';

const profileViewSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  source: {
    type: String,
    enum: ['google', 'bing', 'direct', 'ai_referral', 'tendorai_search', 'unknown'],
    default: 'unknown',
  },
  userAgent: String,
  ip: String,
});

profileViewSchema.index({ vendorId: 1, timestamp: -1 });
profileViewSchema.index({ ip: 1, vendorId: 1, timestamp: 1 });

export default mongoose.model('ProfileView', profileViewSchema);
