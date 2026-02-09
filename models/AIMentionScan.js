import mongoose from 'mongoose';

const aiMentionScanSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  scanDate: { type: Date, default: Date.now },
  prompt: { type: String, required: true },
  mentioned: { type: Boolean, required: true },
  position: {
    type: String,
    enum: ['first', 'top3', 'mentioned', 'not_mentioned'],
    required: true,
  },
  aiModel: { type: String, default: 'claude-haiku' },
  competitorsMentioned: [String],
  category: { type: String, required: true },
  location: { type: String, required: true },
  responseSnippet: { type: String, maxlength: 500 },
  source: { type: String, default: 'weekly_scan', enum: ['weekly_scan', 'live_test'] },
}, {
  timestamps: false,
  collection: 'ai_mention_scans',
});

aiMentionScanSchema.index({ vendorId: 1, scanDate: -1 });
aiMentionScanSchema.index({ scanDate: -1 });
aiMentionScanSchema.index({ vendorId: 1, mentioned: 1, scanDate: -1 });

export default mongoose.model('AIMentionScan', aiMentionScanSchema);
