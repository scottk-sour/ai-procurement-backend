import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema({
  quoteRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuoteRequest',
    required: true,
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorProduct',
    required: true,
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
  },
  matchScore: {
    total: { type: Number, required: true, min: 0, max: 1 },
    breakdown: {
      volumeMatch: { type: Number, min: 0, max: 1 },
      costEfficiency: { type: Number, min: 0, max: 1 },
      speedMatch: { type: Number, min: 0, max: 1 },
      featureMatch: { type: Number, min: 0, max: 1 },
      reliabilityMatch: { type: Number, min: 0, max: 1 },
      paperSizeMatch: { type: Number, min: 0, max: 1 },
      urgencyMatch: { type: Number, min: 0, max: 1 },
    },
    reasoning: [{ type: String }],
    confidence: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      required: true,
    },
  },
  costs: {
    machineCost: { type: Number, required: true },
    installation: { type: Number, required: true },
    profitMargin: { type: Number, required: true },
    totalMachineCost: { type: Number, required: true },
    cpcRates: {
      monoRate: { type: Number, required: true },
      colourRate: { type: Number, required: true },
      paperSize: { type: String, required: true },
    },
    monthlyCosts: {
      monoPages: { type: Number, required: true },
      colourPages: { type: Number, required: true },
      monoCpcCost: { type: Number, required: true },
      colourCpcCost: { type: Number, required: true },
      totalCpcCost: { type: Number, required: true },
      leaseCost: { type: Number, required: true },
      serviceCost: { type: Number, required: true },
      totalMonthlyCost: { type: Number, required: true },
    },
    annualCosts: {
      totalCPC: { type: Number },
      totalLease: { type: Number },
      totalService: { type: Number },
      totalAnnual: { type: Number },
    },
    currentSetupComparison: {
      currentMonoCPC: { type: Number },
      currentColorCPC: { type: Number },
      currentLeaseCost: { type: Number },
      currentServiceCost: { type: Number },
      currentTotalMonthlyCost: { type: Number },
      savings: {
        cpcSavings: { type: Number },
        leaseSavings: { type: Number },
        serviceSavings: { type: Number },
        totalMonthlySavings: { type: Number },
        annualSavings: { type: Number },
        percentageSaved: { type: Number },
      },
    },
    // Settlement/Buyout from existing contract
    currentSetup: {
      buyoutRequired: { type: Boolean, default: false },
      buyoutCost: { type: Number, default: 0 },
      buyoutMonthlyImpact: { type: Number, default: 0 },
      buyoutSpreadMonths: { type: Number, default: 0 },
    },
    // Effective monthly cost including buyout
    effectiveMonthlyCost: {
      baseMonthly: { type: Number },
      withBuyout: { type: Number },
      buyoutPortion: { type: Number },
    },
    // Lease calculation breakdown for transparency
    leaseCalculation: {
      machineCostBreakdown: {
        baseMachineCost: { type: Number },
        installation: { type: Number },
        profitMargin: { type: Number },
        total: { type: Number },
      },
      leaseMargin: { type: Number },
      leaseMarginPercent: { type: String },
      totalLeaseValue: { type: Number },
      term: { type: Number },
      quarterlyPayment: { type: Number },
      monthlyPayment: { type: Number },
      calculationFormula: { type: String },
    },
  },
  leaseOptions: [{
    term: { type: Number, required: true },
    quarterlyPayment: { type: Number, required: true },
    monthlyPayment: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    isRecommended: { type: Boolean, default: false },
    description: { type: String },
  }],
  productSummary: {
    manufacturer: { type: String, required: true },
    model: { type: String, required: true },
    category: { type: String, required: true },
    speed: { type: Number, required: true },
    features: [{ type: String }],
    paperSizes: [{ type: String }],
    volumeRange: { type: String },
    isA3: { type: Boolean },
    description: { type: String },
  },
  serviceDetails: {
    level: { type: String, enum: ['Basic', 'Standard', 'Premium'] },
    responseTime: { type: String },
    supportHours: { type: String },
    onSiteSupport: { type: Boolean, default: true },
    remoteSupport: { type: Boolean, default: true },
    trainingIncluded: { type: Boolean, default: false },
    warrantyPeriod: { type: String, default: "12 months" },
    quarterlyServiceCost: { type: Number },
  },
  accessories: [{
    item: { type: String, required: true },
    description: { type: String },
    cost: { type: Number, required: true },
    isRecommended: { type: Boolean, default: false },
    category: { type: String, enum: ['Essential', 'Recommended', 'Optional'] },
  }],
  terms: {
    validUntil: { type: Date, required: true },
    deliveryTime: { type: String, default: "2-3 weeks" },
    installationTime: { type: String, default: "1-2 days" },
    paymentTerms: { type: String, default: "Net 30" },
    cancellationPolicy: { type: String },
    upgradeOptions: { type: String },
    minimumContractTerm: { type: Number },
    autoRenewal: { type: Boolean, default: false },
  },
  status: {
  type: String,
  enum: ['pending', 'contacted', 'accepted', 'rejected', 'expired', 'generated'],
  default: 'pending',
},

  customerActions: [{
    action: { type: String, enum: ['viewed', 'contacted', 'accepted', 'rejected'] },
    timestamp: { type: Date, default: Date.now },
    notes: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
  }],
  ranking: {
    type: Number,
    min: 1,
    max: 3,
    required: true,
  },
  decisionDetails: {
    acceptedAt: { type: Date },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String },
    decisionNotes: { type: String },
  },
  createdOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  contactAttempts: [{
    contactedAt: { type: Date, default: Date.now },
    contactedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    method: { type: String, enum: ['platform_request', 'email', 'phone'], default: 'platform_request' },
    message: { type: String },
    status: { type: String, enum: ['pending', 'responded', 'no_response'], default: 'pending' },
  }],
  internalNotes: [{
    note: { type: String, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
    type: { type: String, enum: ['admin', 'vendor', 'system'], default: 'admin' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  }],
  metrics: {
    viewCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    timeToView: { type: Number },
    timeToDecision: { type: Number },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtuals
quoteSchema.virtual('rankingDisplay').get(function () {
  const rankings = { 1: '1st Choice', 2: '2nd Choice', 3: '3rd Choice' };
  return rankings[this.ranking] || `${this.ranking} Choice`;
});

quoteSchema.virtual('savingsDisplay').get(function () {
  if (!this.costs?.currentSetupComparison?.savings?.totalMonthlySavings) {
    return 'No savings data';
  }
  const amount = this.costs.currentSetupComparison.savings.totalMonthlySavings;
  const percentage = this.costs.currentSetupComparison.savings.percentageSaved || 0;
  if (amount > 0) {
    return `Save £${amount.toFixed(2)}/month (${percentage.toFixed(1)}%)`;
  } else if (amount < 0) {
    return `£${Math.abs(amount).toFixed(2)}/month more (${Math.abs(percentage).toFixed(1)}% increase)`;
  } else {
    return 'Similar cost to current setup';
  }
});

quoteSchema.virtual('cpcDisplay').get(function () {
  if (!this.costs?.cpcRates) return 'CPC rates not available';
  const mono = this.costs.cpcRates.monoRate;
  const colour = this.costs.cpcRates.colourRate;
  const size = this.costs.cpcRates.paperSize;
  if (colour > 0) {
    return `${mono}p mono, ${colour}p colour (${size})`;
  } else {
    return `${mono}p mono only (${size})`;
  }
});

quoteSchema.virtual('statusDisplay').get(function () {
  const statusDisplayMap = {
    pending: 'Pending',
    contacted: 'Contacted',
    accepted: 'Accepted',
    rejected: 'Declined',
    expired: 'Expired',
  };
  return statusDisplayMap[this.status] || this.status;
});

// Pre-save middleware
quoteSchema.pre('save', function (next) {
  if (this.costs?.cpcRates && this.costs?.monthlyCosts) {
    const monoPages = this.costs.monthlyCosts.monoPages || 0;
    const colourPages = this.costs.monthlyCosts.colourPages || 0;
    const monoRate = this.costs.cpcRates.monoRate || 0;
    const colourRate = this.costs.cpcRates.colourRate || 0;
    this.costs.monthlyCosts.monoCpcCost = (monoPages * monoRate) / 100;
    this.costs.monthlyCosts.colourCpcCost = (colourPages * colourRate) / 100;
    this.costs.monthlyCosts.totalCpcCost = this.costs.monthlyCosts.monoCpcCost + this.costs.monthlyCosts.colourCpcCost;
    this.costs.monthlyCosts.totalMonthlyCost =
      this.costs.monthlyCosts.totalCpcCost +
      (this.costs.monthlyCosts.leaseCost || 0) +
      (this.costs.monthlyCosts.serviceCost || 0);
  }
  if (this.costs?.monthlyCosts?.totalMonthlyCost) {
    this.costs.annualCosts = {
      totalCPC: this.costs.monthlyCosts.totalCpcCost * 12,
      totalLease: this.costs.monthlyCosts.leaseCost * 12,
      totalService: this.costs.monthlyCosts.serviceCost * 12,
      totalAnnual: this.costs.monthlyCosts.totalMonthlyCost * 12,
    };
  }
  if (!this.terms?.validUntil) {
    this.terms = this.terms || {};
    this.terms.validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  if ((this.status === 'accepted' || this.status === 'rejected') && !this.metrics?.timeToDecision) {
    this.metrics = this.metrics || {};
    this.metrics.timeToDecision = Math.round((Date.now() - this.createdAt) / (1000 * 60));
  }
  next();
});

// Indexes
quoteSchema.index({ quoteRequest: 1, ranking: 1 });
quoteSchema.index({ vendor: 1, status: 1 });
quoteSchema.index({ status: 1, 'terms.validUntil': 1 });
quoteSchema.index({ 'matchScore.total': -1 });
quoteSchema.index({ 'costs.monthlyCosts.totalMonthlyCost': 1 });
quoteSchema.index({ createdAt: -1 });
quoteSchema.index({ 'contactAttempts.contactedAt': -1 });

const Quote = mongoose.model('Quote', quoteSchema);
export default Quote;
