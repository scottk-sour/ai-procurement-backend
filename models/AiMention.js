import mongoose from 'mongoose';

const aiMentionSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  query: { type: String, default: '' },
  category: { type: String, default: '' },
  postcode: { type: String, default: '' },
  vendorsReturned: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    companyName: { type: String },
    tier: { type: String },
    position: { type: Number },
  }],
  source: { type: String, default: 'unknown' },
  nluUsed: { type: Boolean, default: false },
}, {
  timestamps: false,
  collection: 'aiMentions',
});

// TTL: expire after 1 year
aiMentionSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export default mongoose.model('AiMention', aiMentionSchema);
