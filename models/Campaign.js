import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sector: {
    type: String,
    enum: ['solicitor', 'accountant', 'mortgage-adviser', 'estate-agent', 'all'],
    default: 'all',
  },
  city: { type: String, default: '', trim: true },
  tierFilter: {
    type: String,
    enum: ['all', 'free', 'pro'],
    default: 'all',
  },
  maxFirms: { type: Number, default: 50, min: 1, max: 200 },
  emailType: { type: String, default: 'email1' },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'complete'],
    default: 'draft',
  },
  firmsMatched: { type: Number, default: 0 },
  firmsContacted: { type: Number, default: 0 },
  emailsSent: { type: Number, default: 0 },
  errors: { type: Number, default: 0 },
  outreachIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OutreachLog' }],
  startedAt: { type: Date },
  completedAt: { type: Date },
}, { timestamps: true });

campaignSchema.index({ status: 1 });
campaignSchema.index({ createdAt: -1 });

export default mongoose.model('Campaign', campaignSchema);
