import mongoose from 'mongoose';

const reviewOptOutSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  optedOutAt: { type: Date, default: Date.now },
  source: { type: String, enum: ['unsubscribe_link', 'manual', 'gdpr_request'], default: 'unsubscribe_link' },
  ipAddress: { type: String },
  userAgent: { type: String },
}, { timestamps: true });

reviewOptOutSchema.index({ email: 1, vendor: 1 }, { unique: true });

reviewOptOutSchema.statics.isOptedOut = async function (email, vendorId) {
  const result = await this.findOne({
    email: email.toLowerCase(),
    $or: [{ vendor: vendorId }, { vendor: null }],
  }).lean();
  return !!result;
};

export default mongoose.model('ReviewOptOut', reviewOptOutSchema);
