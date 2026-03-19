import mongoose from 'mongoose';

const vendorScoreHistorySchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  score: { type: Number, required: true },
  breakdown: {
    profile: { type: Number, default: 0 },
    products: { type: Number, default: 0 },
    reviews: { type: Number, default: 0 },
    aiMentions: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 },
    tier: { type: Number, default: 0 },
    verified: { type: Number, default: 0 },
  },
  weekStarting: { type: Date, required: true },
}, {
  timestamps: true,
  collection: 'vendor_score_history',
});

vendorScoreHistorySchema.index({ vendorId: 1, weekStarting: -1 });
vendorScoreHistorySchema.index({ weekStarting: -1 });

export default mongoose.model('VendorScoreHistory', vendorScoreHistorySchema);
