import mongoose from 'mongoose';

const weeklyReportSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  reportNumber: { type: String, required: true },
  generatedAt: { type: Date, default: Date.now },

  scoreHeader: {
    currentScore: Number,
    previousScore: Number,
    weeklyChange: Number,
    rankInCity: Number,
    totalFirmsInCity: Number,
    competitorsAhead: Number,
    monthlyOpportunityLoss: { min: Number, max: Number },
    trendSparkline: [Number],
  },

  boardSummary: String,

  shareOfVoice: [{
    platform: String,
    platformStatus: { type: String, enum: ['live', 'coming_q3_2026', 'coming_q4_2026'] },
    yourSharePercent: Number,
    competitorAvgPercent: Number,
    gap: Number,
  }],

  competitors: [{
    firmName: String,
    visibilityScore: Number,
    weeklyChange: Number,
    trendDirection: { type: String, enum: ['up', 'down', 'flat'] },
    isYou: Boolean,
    citationCount: Number,
    notableMention: String,
  }],
  competitorHeadline: String,

  revenueExposure: {
    monthlyMin: Number,
    monthlyMax: Number,
    methodology: {
      estimatedMonthlyAIQueries: Number,
      citationRateGap: Number,
      averageTransactionValue: Number,
    },
  },

  promptAnalysis: [{
    prompt: String,
    enginesCited: [String],
    citedFirms: [String],
    citedSources: [String],
    youCited: Boolean,
    reasoning: String,
  }],

  authorityGraph: {
    directoriesConnected: [String],
    directoriesMissing: [String],
    schemaCoverage: { connected: Number, total: Number },
    reviewPlatformsConnected: [String],
    reviewPlatformsMissing: [String],
    contentFootprintPages: Number,
    authorityScore: Number,
  },

  perceptionAnalysis: {
    positiveAssociations: [String],
    missingAssociations: [String],
    competitorAssociations: [String],
    inaccurateClaimsDetected: [{
      claim: String,
      sourceEngine: String,
      truth: String,
      severity: { type: String, enum: ['high', 'medium', 'low'] },
    }],
  },

  projections: {
    historicalScores: [Number],
    projectedScores: [Number],
    projectionMethod: { type: String, default: 'linear_regression_8week' },
  },

  opportunityFeed: [{
    detectedQuery: String,
    competitorsCited: [String],
    youCited: Boolean,
    suggestedAction: String,
    estimatedImpact: Number,
    relatedApprovalId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalQueue' },
  }],

  recommendedActions: [{
    title: String,
    description: String,
    estimatedImpact: Number,
    severity: { type: String, enum: ['high', 'medium', 'low'] },
    approvalId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalQueue' },
  }],

  whatsNext: [{
    dayLabel: String,
    eventLabel: String,
    vendorImpact: String,
  }],

  syntheticDataFlags: [{
    field: String,
    isSynthetic: Boolean,
    method: String,
    replaceCondition: String,
  }],

  // Legacy digest field — kept for backwards compat with existing weekly report page
  digest: { type: mongoose.Schema.Types.Mixed },

  status: { type: String, enum: ['generated', 'sent', 'viewed'], default: 'generated' },
  sentAt: Date,
  firstViewedAt: Date,
  pdfGeneratedAt: Date,
  cronVersion: { type: String, default: 'v2' },
}, { timestamps: true });

weeklyReportSchema.index({ vendorId: 1, weekStartDate: -1 });
weeklyReportSchema.index({ reportNumber: 1 }, { unique: true });

weeklyReportSchema.statics.findOrCreate = async function (vendorId, weekStartDate, data) {
  const existing = await this.findOne({ vendorId, weekStartDate });
  if (existing) return existing;
  try {
    return await this.create({ vendorId, weekStartDate, ...data });
  } catch (err) {
    if (err.code === 11000) return await this.findOne({ vendorId, weekStartDate });
    throw err;
  }
};

weeklyReportSchema.methods.toClientJSON = function () {
  const obj = this.toObject();
  delete obj.syntheticDataFlags;
  return {
    ...obj,
    id: obj._id.toString(),
    vendorId: obj.vendorId.toString(),
    weekStartDate: obj.weekStartDate?.toISOString(),
    weekEndDate: obj.weekEndDate?.toISOString(),
    generatedAt: obj.generatedAt?.toISOString(),
    createdAt: obj.createdAt?.toISOString(),
    updatedAt: obj.updatedAt?.toISOString(),
  };
};

export default mongoose.model('WeeklyReport', weeklyReportSchema);
