import mongoose from 'mongoose';

const vendorPostSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  title: { type: String, required: true, maxlength: 200, trim: true },
  body: { type: String, required: true, maxlength: 10000, trim: true },
  category: {
    type: String,
    enum: ['news', 'product', 'offer', 'guide', 'update'],
    default: 'news',
  },
  tags: [{ type: String, trim: true, lowercase: true }],
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'published', 'hidden'],
    default: 'draft',
  },
  slug: { type: String, unique: true, index: true },
  isDemoVendor: { type: Boolean, default: false },
  aiGenerated: { type: Boolean, default: false },
  topic: { type: String, trim: true },
  stats: { type: String, trim: true },
  linkedInText: { type: String, trim: true },
  facebookText: { type: String, trim: true },

  // Writer Agent tracing fields. Optional; existing posts unaffected.
  agentRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentRun', index: true },
  relatedApprovalId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalQueue', index: true },

  // v7 content-planner additions. All optional; existing posts unaffected.
  pillar: {
    type: String,
    enum: [
      'costs-fees', 'process-timelines', 'regulatory-authority',
      'common-mistakes', 'client-rights', 'firm-expertise',
    ],
    default: null,
  },
  plan: {
    type: {
      pillar: String,
      tactic: String,
      structure: String,
      mustInclude: [String],
      namedEntities: [String],
      primaryDataHook: String,
      internalLinking: String,
      wordCount: Number,
      primaryAIQuery: String,
      secondaryQueries: [String],
    },
    default: null,
    _id: false,
  },
  primaryData: {
    type: String,
    maxlength: 2000,
    trim: true,
    default: '',
  },
  amplificationPlan: {
    type: [{
      channel: {
        type: String,
        enum: ['linkedin', 'facebook', 'medium', 'reddit', 'email', 'industry-forum', 'press'],
      },
      dispatchedAt: Date,
      url: String,
      notes: String,
    }],
    default: [],
    _id: false,
  },
  postPublishTests: {
    type: [{
      platform: {
        type: String,
        enum: ['chatgpt', 'perplexity', 'claude', 'gemini', 'grok', 'meta'],
      },
      runAt: Date,
      mentioned: Boolean,
      smv: Number,
      rawQuery: String,
    }],
    default: [],
    _id: false,
  },
}, { timestamps: true });

// Auto-generate slug from title before validation
vendorPostSchema.pre('validate', function (next) {
  if (this.isNew || this.isModified('title')) {
    const base = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 80);
    const vendorSuffix = this.vendor.toString().slice(-6);

    if (this.aiGenerated || this.agentRunId) {
      const d = this.createdAt || new Date();
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      this.slug = `${base}-${vendorSuffix}-${yyyy}${mm}${dd}`;
    } else {
      this.slug = `${base}-${vendorSuffix}`;
    }
  }
  next();
});

// Indexes
vendorPostSchema.index({ status: 1, createdAt: -1 });
vendorPostSchema.index({ vendor: 1, status: 1 });
vendorPostSchema.index({ tags: 1 });
vendorPostSchema.index({ agentRunId: 1, status: 1 }, { sparse: true });

export default mongoose.model('VendorPost', vendorPostSchema);
