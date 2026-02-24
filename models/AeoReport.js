import mongoose from 'mongoose';

const aeoReportSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  category: {
    type: String,
    required: true,
    enum: [
      // Office equipment
      'copiers', 'telecoms', 'cctv', 'it',
      // Solicitors
      'conveyancing', 'family-law', 'criminal-law', 'commercial-law',
      'employment-law', 'wills-and-probate', 'immigration', 'personal-injury',
      // Accountants
      'tax-advisory', 'audit-assurance', 'bookkeeping', 'payroll',
      'corporate-finance', 'business-advisory', 'vat-services', 'financial-planning',
      // Mortgage Advisors
      'residential-mortgages', 'buy-to-let', 'remortgage', 'first-time-buyer',
      'equity-release', 'commercial-mortgages', 'protection-insurance',
      // Estate Agents
      'sales', 'lettings', 'property-management', 'block-management',
      'auctions', 'commercial-property', 'inventory',
      'other',
    ],
  },
  customIndustry: { type: String, trim: true, default: null },
  city: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  name: { type: String, trim: true },
  source: { type: String, trim: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true, default: null },
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

  // Full report fields (optional — basic reports won't have these)
  reportType: { type: String, enum: ['basic', 'full'], default: 'basic' },
  score: { type: Number, min: 0, max: 100, default: null },
  scoreBreakdown: {
    websiteOptimisation: { type: Number, default: null },
    contentAuthority: { type: Number, default: null },
    directoryPresence: { type: Number, default: null },
    reviewSignals: { type: Number, default: null },
    structuredData: { type: Number, default: null },
    competitivePosition: { type: Number, default: null },
  },
  searchedCompany: {
    website: { type: String, default: null },
    hasReviews: { type: Boolean, default: null },
    hasPricing: { type: Boolean, default: null },
    hasBrands: { type: Boolean, default: null },
    hasStructuredData: { type: Boolean, default: null },
    hasDetailedServices: { type: Boolean, default: null },
    hasSocialMedia: { type: Boolean, default: null },
    hasGoogleBusiness: { type: Boolean, default: null },
    summary: { type: String, default: null },
  },
  competitors: [
    {
      name: String,
      description: String,
      reason: String,
      website: { type: String, default: null },
      strengths: [String],
    },
  ],
  gaps: [
    {
      title: String,
      explanation: String,
    },
  ],
  pdfBuffer: { type: Buffer, default: null },
});

aeoReportSchema.index({ createdAt: -1 });
aeoReportSchema.index({ email: 1 }, { sparse: true });
aeoReportSchema.index({ ipAddress: 1, createdAt: -1 });

const AeoReport = mongoose.model('AeoReport', aeoReportSchema);

export default AeoReport;
