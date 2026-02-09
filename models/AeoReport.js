import mongoose from 'mongoose';

const aeoReportSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  category: { type: String, required: true, enum: ['copiers', 'telecoms', 'cctv', 'it'] },
  city: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  aiMentioned: { type: Boolean, required: true },
  aiPosition: { type: Number, default: null },
  aiRecommendations: [
    {
      name: String,
      description: String,
      reason: String,
    },
  ],
  competitorsOnTendorAI: { type: Number, default: 0 },
  ipAddress: { type: String },
  createdAt: { type: Date, default: Date.now },
});

aeoReportSchema.index({ createdAt: -1 });
aeoReportSchema.index({ email: 1 }, { sparse: true });
aeoReportSchema.index({ ipAddress: 1, createdAt: -1 });

const AeoReport = mongoose.model('AeoReport', aeoReportSchema);

export default AeoReport;
