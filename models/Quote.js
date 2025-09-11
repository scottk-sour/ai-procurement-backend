// models/Quote.js - Complete updated version with status management
import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema({
  // Reference to the original quote request
  quoteRequest: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'QuoteRequest',
    required: true 
  },

  // Product being quoted
  product: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'VendorProduct',
    required: true 
  },

  // Vendor information
  vendor: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vendor',
    required: true 
  },

  // User Volume Requirements (from original request)
  userRequirements: {
    monthlyVolume: {
      mono: { type: Number, required: true },
      colour: { type: Number, required: true },
      total: { type: Number, required: true }
    },
    paperSize: { type: String, required: true }, // A4, A3, SRA3
    priority: { type: String, required: true }, // cost, quality, speed, etc.
    maxBudget: { type: Number, required: true },
    urgency: { type: String }, // timeline requirement
    features: [{ type: String }] // required features
  },

  // AI Matching Score
  matchScore: {
    total: { type: Number, required: true, min: 0, max: 1 }, // 0-1 score
    breakdown: {
      volumeMatch: { type: Number, min: 0, max: 1 },
      costEfficiency: { type: Number, min: 0, max: 1 },
      speedMatch: { type: Number, min: 0, max: 1 },
      featureMatch: { type: Number, min: 0, max: 1 },
      reliabilityMatch: { type: Number, min: 0, max: 1 },
      paperSizeMatch: { type: Number, min: 0, max: 1 },
      urgencyMatch: { type: Number, min: 0, max: 1 }
    },
    reasoning: [{ type: String }], // AI explanations
    confidence: { 
      type: String, 
      enum: ['High', 'Medium', 'Low'],
      required: true 
    },
    weightingUsed: { type: String } // Which priority weighting was applied
  },

  // Cost Breakdown
  costs: {
    // Machine costs
    machineCost: { type: Number, required: true },
    installation: { type: Number, required: true },
    profitMargin: { type: Number, required: true },
    totalMachineCost: { type: Number, required: true },

    // CPC Rates Applied
    cpcRates: {
      monoRate: { type: Number, required: true }, // pence per page
      colourRate: { type: Number, required: true }, // pence per page
      paperSize: { type: String, required: true } // Which size rates were used
    },

    // Usage costs (monthly) - CALCULATED from user volumes
    monthlyCosts: {
      monoPages: { type: Number, required: true }, // user mono volume
      colourPages: { type: Number, required: true }, // user colour volume
      monoCpcCost: { type: Number, required: true }, // monoPages × monoRate ÷ 100
      colourCpcCost: { type: Number, required: true }, // colourPages × colourRate ÷ 100
      totalCpcCost: { type: Number, required: true }, // sum of above
      leaseCost: { type: Number, required: true },
      serviceCost: { type: Number, required: true },
      totalMonthlyCost: { type: Number, required: true }
    },

    // Annual projection
    annualCosts: {
      totalCPC: { type: Number },
      totalLease: { type: Number },
      totalService: { type: Number },
      totalAnnual: { type: Number }
    },

    // Comparison with current setup
    currentSetupComparison: {
      currentMonthlyMono: { type: Number }, // user's current mono CPC
      currentMonthlyColour: { type: Number }, // user's current colour CPC
      currentLeaseCost: { type: Number }, // user's current lease
      currentTotalMonthlyCost: { type: Number },
      savings: {
        cpcSavings: { type: Number }, // CPC improvement
        leaseSavings: { type: Number }, // Lease improvement
        totalMonthlySavings: { type: Number },
        annualSavings: { type: Number },
        percentageSaved: { type: Number }
      }
    }
  },

  // Lease Options
  leaseOptions: [{
    term: { type: Number, required: true }, // months (36, 48, 60)
    quarterlyPayment: { type: Number, required: true },
    monthlyPayment: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    margin: { type: Number }, // vendor margin percentage
    interestRate: { type: Number }, // effective rate
    isRecommended: { type: Boolean, default: false },
    description: { type: String } // "Best value" or "Lowest monthly payment"
  }],

  // Product Details Summary (for quick display)
  productSummary: {
    manufacturer: { type: String, required: true },
    model: { type: String, required: true },
    category: { type: String, required: true },
    speed: { type: Number, required: true },
    features: [{ type: String }],
    paperSizes: [{ type: String }],
    volumeRange: { type: String },
    isA3: { type: Boolean },
    description: { type: String }
  },

  // Service & Support
  serviceDetails: {
    level: { type: String, enum: ['Basic', 'Standard', 'Premium'] },
    responseTime: { type: String }, // "4hr", "Next day"
    supportHours: { type: String }, // "9-5" or "24/7"
    onSiteSupport: { type: Boolean, default: true },
    remoteSupport: { type: Boolean, default: true },
    trainingIncluded: { type: Boolean, default: false },
    warrantyPeriod: { type: String, default: "12 months" },
    quarterlyServiceCost: { type: Number }
  },

  // Additional Options
  accessories: [{
    item: { type: String, required: true },
    description: { type: String },
    cost: { type: Number, required: true },
    isRecommended: { type: Boolean, default: false },
    category: { type: String, enum: ['Essential', 'Recommended', 'Optional'] }
  }],

  // Terms & Conditions
  terms: {
    validUntil: { type: Date, required: true },
    deliveryTime: { type: String, default: "2-3 weeks" },
    installationTime: { type: String, default: "1-2 days" },
    paymentTerms: { type: String, default: "Net 30" },
    cancellationPolicy: { type: String },
    upgradeOptions: { type: String },
    minimumContractTerm: { type: Number }, // months
    autoRenewal: { type: Boolean, default: false }
  },

  // Quote Status - ENHANCED
  status: { 
    type: String, 
    enum: ['draft', 'generated', 'sent', 'viewed', 'downloaded', 'accepted', 'rejected', 'expired', 'withdrawn', 'converted'],
    default: 'generated'
  },

  // Customer Interaction
  customerActions: [{
    action: { 
      type: String, 
      enum: ['viewed', 'downloaded', 'shared', 'requested_demo', 'requested_call', 'questioned', 'accepted', 'rejected']
    },
    timestamp: { type: Date, default: Date.now },
    notes: { type: String },
    ipAddress: { type: String }, // for tracking
    userAgent: { type: String }
  }],

  // Ranking among alternatives (1st, 2nd, 3rd choice)
  ranking: { 
    type: Number, 
    min: 1, 
    max: 5, // Allow up to 5 quotes
    required: true 
  },

  // AI Confidence and Explanation
  aiInsights: {
    whyRecommended: [{ type: String }], // Bullet points of benefits
    potentialConcerns: [{ type: String }], // Any limitations
    bestForScenarios: [{ type: String }], // When this quote is ideal
    comparisonToAlternatives: { type: String }
  },

  // Admin/Vendor Notes
  internalNotes: [{
    note: { type: String, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
    type: { type: String, enum: ['admin', 'vendor', 'system'], default: 'admin' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
  }],

  // Communication Log
  communications: [{
    type: { type: String, enum: ['email', 'phone', 'meeting', 'demo', 'follow_up'] },
    date: { type: Date, required: true },
    summary: { type: String, required: true },
    outcome: { type: String },
    nextAction: { type: String },
    scheduledFollowUp: { type: Date }
  }],

  // Performance Tracking
  metrics: {
    viewCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    timeToView: { type: Number }, // minutes from creation to first view
    timeToDecision: { type: Number }, // minutes from creation to accept/reject
    competitorQuotesReceived: { type: Number, default: 0 }
  },

  // NEW: Quote Decision Tracking
  decisionDetails: {
    acceptedAt: { type: Date },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String },
    decisionNotes: { type: String }
  },

  // NEW: Order Creation (when quote is accepted)
  createdOrder: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order' 
  },

  // Contact attempts tracking
  contactAttempts: [{
    contactedAt: { type: Date, default: Date.now },
    contactedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    method: { type: String, enum: ['platform_request', 'email', 'phone'], default: 'platform_request' },
    message: { type: String },
    status: { type: String, enum: ['pending', 'responded', 'no_response'], default: 'pending' }
  }]

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted ranking
quoteSchema.virtual('rankingDisplay').get(function() {
  const rankings = { 1: '1st Choice', 2: '2nd Choice', 3: '3rd Choice', 4: '4th Choice', 5: '5th Choice' };
  return rankings[this.ranking] || `${this.ranking} Choice`;
});

// Virtual for monthly savings display
quoteSchema.virtual('savingsDisplay').get(function() {
  if (!this.costs?.currentSetupComparison?.savings?.totalMonthlySavings) {
    return 'No comparison data';
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

// Virtual for total CPC display
quoteSchema.virtual('cpcDisplay').get(function() {
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

// NEW: Virtual for status display
quoteSchema.virtual('statusDisplay').get(function() {
  const statusDisplayMap = {
    'draft': 'Draft',
    'generated': 'Generated',
    'sent': 'Sent to Customer',
    'viewed': 'Viewed by Customer',
    'downloaded': 'Downloaded',
    'accepted': 'Accepted',
    'rejected': 'Declined',
    'expired': 'Expired',
    'withdrawn': 'Withdrawn',
    'converted': 'Converted to Order'
  };
  return statusDisplayMap[this.status] || this.status;
});

// Pre-save middleware to calculate totals and CPC costs
quoteSchema.pre('save', function(next) {
  // Calculate monthly CPC costs from user volumes and rates
  if (this.userRequirements?.monthlyVolume && this.costs?.cpcRates) {
    const monoPages = this.userRequirements.monthlyVolume.mono || 0;
    const colourPages = this.userRequirements.monthlyVolume.colour || 0;
    const monoRate = this.costs.cpcRates.monoRate || 0;
    const colourRate = this.costs.cpcRates.colourRate || 0;
    
    // Calculate costs (convert pence to pounds)
    const monoCpcCost = (monoPages * monoRate) / 100;
    const colourCpcCost = (colourPages * colourRate) / 100;
    
    // Update monthly costs
    this.costs.monthlyCosts = this.costs.monthlyCosts || {};
    this.costs.monthlyCosts.monoPages = monoPages;
    this.costs.monthlyCosts.colourPages = colourPages;
    this.costs.monthlyCosts.monoCpcCost = monoCpcCost;
    this.costs.monthlyCosts.colourCpcCost = colourCpcCost;
    this.costs.monthlyCosts.totalCpcCost = monoCpcCost + colourCpcCost;
    
    // Calculate total monthly cost
    this.costs.monthlyCosts.totalMonthlyCost = 
      this.costs.monthlyCosts.totalCpcCost + 
      (this.costs.monthlyCosts.leaseCost || 0) + 
      (this.costs.monthlyCosts.serviceCost || 0);
  }

  // Calculate lease monthly payments from quarterly
  if (this.leaseOptions) {
    this.leaseOptions.forEach(option => {
      if (option.quarterlyPayment && !option.monthlyPayment) {
        option.monthlyPayment = option.quarterlyPayment / 3;
      }
      if (option.quarterlyPayment && option.term && !option.totalCost) {
        option.totalCost = option.quarterlyPayment * (option.term / 3);
      }
    });
  }

  // Set expiry date if not set (30 days from now)
  if (!this.terms.validUntil) {
    this.terms.validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  // Calculate annual costs
  if (this.costs?.monthlyCosts?.totalMonthlyCost) {
    this.costs.annualCosts = {
      totalCPC: this.costs.monthlyCosts.totalCpcCost * 12,
      totalLease: this.costs.monthlyCosts.leaseCost * 12,
      totalService: this.costs.monthlyCosts.serviceCost * 12,
      totalAnnual: this.costs.monthlyCosts.totalMonthlyCost * 12
    };
  }

  // Calculate time to decision if status changed to accepted/rejected
  if ((this.status === 'accepted' || this.status === 'rejected') && !this.metrics.timeToDecision) {
    this.metrics.timeToDecision = Math.round((Date.now() - this.createdAt) / (1000 * 60)); // minutes
  }

  next();
});

// Indexes for efficient querying
quoteSchema.index({ quoteRequest: 1, ranking: 1 });
quoteSchema.index({ vendor: 1, status: 1 });
quoteSchema.index({ status: 1, 'terms.validUntil': 1 });
quoteSchema.index({ 'matchScore.total': -1 });
quoteSchema.index({ 'costs.monthlyCosts.totalMonthlyCost': 1 });
quoteSchema.index({ createdAt: -1 });
quoteSchema.index({ 'userRequirements.monthlyVolume.total': 1 });
quoteSchema.index({ 'decisionDetails.acceptedAt': -1 });
quoteSchema.index({ 'decisionDetails.rejectedAt': -1 });

const Quote = mongoose.model('Quote', quoteSchema);
export default Quote;
