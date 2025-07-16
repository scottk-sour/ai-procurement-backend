// models/Quote.js
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

  // AI Matching Score
  matchScore: {
    total: { type: Number, required: true }, // 0-1 score
    breakdown: {
      volumeMatch: { type: Number },
      costEfficiency: { type: Number },
      speedMatch: { type: Number },
      featureMatch: { type: Number },
      reliabilityMatch: { type: Number }
    },
    reasoning: [{ type: String }], // AI explanations
    confidence: { 
      type: String, 
      enum: ['High', 'Medium', 'Low'],
      required: true 
    }
  },

  // Cost Breakdown
  costs: {
    // Machine costs
    machineCost: { type: Number, required: true },
    installation: { type: Number, required: true },
    profitMargin: { type: Number, required: true },
    totalMachineCost: { type: Number, required: true },

    // Usage costs (monthly)
    monthlyCosts: {
      monoPages: { type: Number, required: true },
      colourPages: { type: Number, required: true },
      cpcCosts: { type: Number, required: true }, // total CPC cost
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

    // Savings vs current setup
    savings: {
      monthlyAmount: { type: Number },
      annualAmount: { type: Number },
      percentageSaved: { type: Number },
      description: { type: String }
    }
  },

  // Lease Options
  leaseOptions: [{
    term: { type: Number, required: true }, // months
    quarterlyPayment: { type: Number, required: true },
    monthlyPayment: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    margin: { type: Number }, // vendor margin percentage
    isRecommended: { type: Boolean, default: false }
  }],

  // Product Details Summary (for quick display)
  productSummary: {
    manufacturer: { type: String, required: true },
    model: { type: String, required: true },
    category: { type: String, required: true },
    speed: { type: Number, required: true },
    features: [{ type: String }],
    paperSizes: [{ type: String }],
    volumeRange: { type: String }
  },

  // Service & Support
  serviceDetails: {
    responseTime: { type: String },
    serviceLevel: { type: String },
    supportHours: { type: String },
    onSiteSupport: { type: Boolean },
    remoteSupport: { type: Boolean },
    trainingIncluded: { type: Boolean },
    warrantyPeriod: { type: String }
  },

  // Additional Options
  accessories: [{
    item: { type: String },
    description: { type: String },
    cost: { type: Number },
    isRecommended: { type: Boolean, default: false }
  }],

  // Terms & Conditions
  terms: {
    validUntil: { type: Date, required: true },
    deliveryTime: { type: String }, // "2-3 weeks"
    installationTime: { type: String }, // "1-2 days"
    paymentTerms: { type: String },
    cancellationPolicy: { type: String },
    upgradeOptions: { type: String }
  },

  // Quote Status
  status: { 
    type: String, 
    enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'withdrawn'],
    default: 'draft'
  },

  // Customer Interaction
  customerActions: [{
    action: { 
      type: String, 
      enum: ['viewed', 'downloaded', 'shared', 'requested_demo', 'requested_call', 'accepted', 'rejected']
    },
    timestamp: { type: Date, default: Date.now },
    notes: { type: String }
  }],

  // Ranking (1st, 2nd, 3rd choice)
  ranking: { 
    type: Number, 
    min: 1, 
    max: 3,
    required: true 
  },

  // Admin/Vendor Notes
  internalNotes: [{
    note: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
    type: { type: String, enum: ['admin', 'vendor', 'system'], default: 'admin' }
  }],

  // Communication
  communications: [{
    type: { type: String, enum: ['email', 'phone', 'meeting', 'demo'] },
    date: { type: Date },
    summary: { type: String },
    nextAction: { type: String }
  }]

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted ranking
quoteSchema.virtual('rankingDisplay').get(function() {
  const rankings = { 1: '1st Choice', 2: '2nd Choice', 3: '3rd Choice' };
  return rankings[this.ranking] || `${this.ranking} Choice`;
});

// Virtual for monthly savings display
quoteSchema.virtual('savingsDisplay').get(function() {
  if (!this.costs?.savings?.monthlyAmount) return 'No savings data';
  
  const amount = this.costs.savings.monthlyAmount;
  const percentage = this.costs.savings.percentageSaved || 0;
  
  if (amount > 0) {
    return `Save £${amount.toFixed(2)}/month (${percentage.toFixed(1)}%)`;
  } else {
    return `£${Math.abs(amount).toFixed(2)}/month more`;
  }
});

// Virtual for lease range display
quoteSchema.virtual('leaseRangeDisplay').get(function() {
  if (!this.leaseOptions || this.leaseOptions.length === 0) return 'No lease options';
  
  const payments = this.leaseOptions.map(opt => opt.quarterlyPayment);
  const min = Math.min(...payments);
  const max = Math.max(...payments);
  
  if (min === max) return `£${min.toFixed(2)}/quarter`;
  return `£${min.toFixed(2)} - £${max.toFixed(2)}/quarter`;
});

// Pre-save middleware to calculate totals
quoteSchema.pre('save', function(next) {
  // Calculate monthly payment from quarterly
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

  // Calculate annual costs if monthly costs exist
  if (this.costs?.monthlyCosts?.totalMonthlyCost) {
    this.costs.annualCosts = {
      totalCPC: this.costs.monthlyCosts.cpcCosts * 12,
      totalLease: this.costs.monthlyCosts.leaseCost * 12,
      totalService: this.costs.monthlyCosts.serviceCost * 12,
      totalAnnual: this.costs.monthlyCosts.totalMonthlyCost * 12
    };
  }

  next();
});

// Indexes for efficient querying
quoteSchema.index({ quoteRequest: 1, ranking: 1 });
quoteSchema.index({ vendor: 1 });
quoteSchema.index({ status: 1 });
quoteSchema.index({ 'matchScore.total': -1 });
quoteSchema.index({ 'costs.monthlyCosts.totalMonthlyCost': 1 });
quoteSchema.index({ 'terms.validUntil': 1 });
quoteSchema.index({ createdAt: -1 });

const Quote = mongoose.model('Quote', quoteSchema);
export default Quote;