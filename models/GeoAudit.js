import mongoose from 'mongoose';

const geoCheckSchema = new mongoose.Schema({
  name: { type: String, required: true },
  key: { type: String, required: true },
  score: { type: Number, min: 0, max: 10, default: 0 },
  maxScore: { type: Number, default: 10 },
  passed: { type: Boolean, default: false },
  details: { type: String, default: '' },
  recommendation: { type: String, default: '' },
}, { _id: false });

const geoAuditSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  websiteUrl: { type: String, required: true },
  overallScore: { type: Number, min: 0, max: 100, default: 0 },
  checks: [geoCheckSchema],
  recommendations: [String],
  tendoraiSchemaDetected: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

geoAuditSchema.index({ vendorId: 1, createdAt: -1 });

export default mongoose.model('GeoAudit', geoAuditSchema);
