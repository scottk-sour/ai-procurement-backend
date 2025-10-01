import mongoose from 'mongoose';

const QuoteRequestSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  contactName: { type: String }, // Kept from your version
  email: { type: String, required: true },
  phone: { type: String }, // Kept from your version
  industryType: {
    type: String,
    enum: ['Healthcare', 'Legal', 'Education', 'Finance', 'Government', 'Manufacturing', 'Retail', 'Technology', 'Construction', 'Other'],
    required: true,
  },
  numEmployees: {
    type: String,
    enum: ['1-10', '11-25', '26-50', '51-100', '101-250', '251-500', '500+'],
    required: true,
  },
  numLocations: { type: Number, required: true },
  serviceType: { type: String, default: 'Photocopiers' },
  monthlyVolume: {
    mono: { type: Number, default: 0 },
    colour: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    volumeRange: {
      type: String,
      enum: ['0-6k', '6k-13k', '13k-20k', '20k-30k', '30k-40k', '40k-50k', '50k+'],
    },
  },
  paperRequirements: {
    primarySize: { type: String, enum: ['A4', 'A3', 'SRA3'], required: true },
    additionalSizes: [{ type: String, enum: ['A4', 'A3', 'SRA3', 'A5', 'Letter', 'Legal'] }],
    specialPaper: { type: Boolean, default: false },
    specialPaperTypes: [{ type: String }],
  },
  currentSetup: {
    machineAge: { type: String, enum: ['0-2 years', '2-5 years', '5+ years', 'No current machine'] },
    currentSupplier: { type: String },
    contractEndDate: { type: Date },
    currentMonoCPC: { type: Number, default: 0 },
    currentColorCPC: { type: Number, default: 0 },
    quarterlyLeaseCost: { type: Number, default: 0 },
    quarterlyService: { type: Number, default: 0 },
    monthlySpend: { type: Number, default: 0 },
    annualSpend: { type: Number, default: 0 },
  },
  requirements: {
    minSpeed: { type: Number, default: 0 },
    priority: { type: String, enum: ['cost', 'speed', 'quality', 'reliability', 'balanced'] },
    essentialFeatures: [{ type: String }],
    niceToHaveFeatures: [{ type: String }],
    serviceLevel: { type: String, enum: ['Basic', 'Standard', 'Premium'] },
    responseTime: { type: String, enum: ['4hr', '8hr', 'Next day', '48hr'] },
  },
  budget: {
    maxLeasePrice: { type: Number, required: true },
    preferredTerm: { type: String, enum: ['12 months', '24 months', '36 months', '48 months', '60 months'] },
  },
  urgency: {
    timeframe: { type: String, enum: ['Immediately', '1-3 months', '3-6 months', '6+ months'] },
  },
  location: {
    postcode: { type: String },
  },
  aiAnalysis: {
    processed: { type: Boolean, default: false },
    processedAt: { type: Date },
    suggestedCategories: [{ type: String }],
    riskFactors: [{ type: String }],
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'matched', 'completed', 'accepted', 'declined'],
    default: 'pending',
  },
  submissionSource: { type: String, enum: ['web_form', 'phone', 'email', 'admin'], default: 'web_form' },
  quotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quote' }],
  acceptedQuote: { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' },
  internalNotes: [{ type: String }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for current monthly cost
QuoteRequestSchema.virtual('currentMonthlyCost').get(function () {
  if (!this.currentSetup) return 0;
  const { mono, colour } = this.monthlyVolume || { mono: 0, colour: 0 };
  const { currentMonoCPC, currentColorCPC, quarterlyLeaseCost, quarterlyService } = this.currentSetup;
  const cpcCost = ((mono * (currentMonoCPC || 0)) + (colour * (currentColorCPC || 0))) / 100;
  const leaseCost = (quarterlyLeaseCost || 0) / 3;
  const serviceCost = (quarterlyService || 0) / 3;
  return cpcCost + leaseCost + serviceCost;
});

// Pre-save middleware
QuoteRequestSchema.pre('save', function (next) {
  if (this.monthlyVolume.mono && this.monthlyVolume.colour) {
    this.monthlyVolume.total = this.monthlyVolume.mono + this.monthlyVolume.colour;
    const total = this.monthlyVolume.total;
    if (total <= 6000) this.monthlyVolume.volumeRange = '0-6k';
    else if (total <= 13000) this.monthlyVolume.volumeRange = '6k-13k';
    else if (total <= 20000) this.monthlyVolume.volumeRange = '13k-20k';
    else if (total <= 30000) this.monthlyVolume.volumeRange = '20k-30k';
    else if (total <= 40000) this.monthlyVolume.volumeRange = '30k-40k';
    else if (total <= 50000) this.monthlyVolume.volumeRange = '40k-50k';
    else this.monthlyVolume.volumeRange = '50k+';
  }
  if (!this.requirements.minSpeed && this.monthlyVolume.total) {
    const total = this.monthlyVolume.total;
    if (total <= 6000) this.requirements.minSpeed = 20;
    else if (total <= 13000) this.requirements.minSpeed = 25;
    else if (total <= 20000) this.requirements.minSpeed = 30;
    else if (total <= 30000) this.requirements.minSpeed = 35;
    else if (total <= 40000) this.requirements.minSpeed = 45;
    else if (total <= 50000) this.requirements.minSpeed = 55;
    else this.requirements.minSpeed = 65;
  }
  next();
});

// Indexes
QuoteRequestSchema.index({ 'monthlyVolume.volumeRange': 1 });
QuoteRequestSchema.index({ 'paperRequirements.primarySize': 1 });
QuoteRequestSchema.index({ submittedBy: 1 });
QuoteRequestSchema.index({ status: 1 });
QuoteRequestSchema.index({ createdAt: -1 });
QuoteRequestSchema.index({ 'budget.maxLeasePrice': 1 });

export default mongoose.model('QuoteRequest', QuoteRequestSchema);
