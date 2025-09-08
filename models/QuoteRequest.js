// models/QuoteRequest.js
import mongoose from 'mongoose';

const quoteRequestSchema = new mongoose.Schema({
  // Customer Details
  companyName: { type: String, required: true },
  contactName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  industryType: { 
    type: String, 
    enum: ['Healthcare', 'Legal', 'Education', 'Finance', 'Government', 'Manufacturing', 'Retail', 'Other'],
    required: true 
  },
  numEmployees: { type: Number, required: true },
  numLocations: { type: Number, required: true },

  // Volume Analysis (Critical for matching)
  monthlyVolume: {
    mono: { type: Number, required: true },
    colour: { type: Number, required: true },
    total: { type: Number, required: true },
    volumeRange: { 
      type: String, 
      enum: ['0-6k', '6k-13k', '13k-20k', '20k-30k', '30k-40k', '40k-50k', '50k+']
    }
  },

  // Paper Requirements (Critical for matching)
  paperRequirements: {
    primarySize: { 
      type: String, 
      enum: ['A4', 'A3', 'SRA3'],
      required: true 
    },
    additionalSizes: [{ 
      type: String, 
      enum: ['A4', 'A3', 'SRA3', 'A5'] 
    }],
    specialPaper: { type: Boolean, default: false },
    specialPaperTypes: [{ type: String }]
  },

  // Current Setup
  currentSetup: {
    machineAge: { 
      type: String, 
      enum: ['Under 2 years', '2-5 years', '5+ years', 'No current machine'],
      required: true 
    },
    currentSupplier: { type: String },
    contractEndDate: { type: Date },
    currentCosts: {
      monoRate: { type: Number }, // pence per page
      colourRate: { type: Number }, // pence per page
      quarterlyLeaseCost: { type: Number },
      quarterlyService: { type: Number }
    },
    painPoints: [{ type: String }],
    satisfactionLevel: { 
      type: String, 
      enum: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied']
    }
  },

  // Requirements (for AI matching)
  requirements: {
    priority: { 
      type: String, 
      enum: ['speed', 'quality', 'reliability', 'cost', 'balanced'],
      required: true 
    },
    essentialFeatures: [{ 
      type: String,
      enum: [
        'Duplex Printing', 'Wireless Printing', 'Mobile Printing', 'Cloud Integration',
        'Advanced Security', 'Large Paper Trays', 'High Capacity Toner',
        'Color Printing', 'Scanning', 'Fax', 'Copying', 'Email Integration',
        'Stapling', 'Hole Punch', 'Booklet Making', 'Large Capacity Trays',
        'Touch Screen', 'Auto Document Feeder', 'ID Card Copying'
      ]
    }],
    niceToHaveFeatures: [{ type: String }],
    minSpeed: { type: Number }, // pages per minute
    maxNoisLevel: { type: Number },
    environmentalConcerns: { type: Boolean, default: false }
  },

  // Budget
  budget: {
    maxLeasePrice: { type: Number, required: true }, // quarterly
    preferredTerm: { 
      type: String, 
      enum: ['12 months', '24 months', '36 months', '48 months', '60 months'],
      default: '36 months'
    },
    includeService: { type: Boolean, default: true },
    includeConsumables: { type: Boolean, default: true }
  },

  // Urgency & Location
  urgency: {
    timeframe: { 
      type: String, 
      enum: ['Immediately', 'Within 1 month', '1-3 months', '3+ months'],
      required: true 
    },
    reason: { type: String }
  },

  location: {
    postcode: { type: String, required: true },
    city: { type: String },
    region: { type: String },
    installationRequirements: { type: String }
  },

  // AI Processing Results
  aiAnalysis: {
    processed: { type: Boolean, default: false },
    suggestedCategories: [{ type: String }],
    volumeCategory: { type: String },
    riskFactors: [{ type: String }],
    recommendations: [{ type: String }],
    processedAt: { type: Date }
  },

  // Generated Quotes
  quotes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Quote' 
  }],

  // FIXED: Updated status field to include 'matched' for AI processing
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'matched', 'quotes_generated', 'quotes_sent', 'completed', 'cancelled'],
    default: 'pending'
  },

  // System Fields
  submittedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  submissionSource: { 
    type: String, 
    enum: ['web_form', 'phone', 'email', 'admin'],
    default: 'web_form'
  },
  internalNotes: [{ 
    note: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now }
  }],

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total current monthly cost
quoteRequestSchema.virtual('currentMonthlyCost').get(function() {
  if (!this.currentSetup?.currentCosts) return 0;
  
  const { mono, colour } = this.monthlyVolume;
  const { monoRate, colourRate, quarterlyLeaseCost, quarterlyService } = this.currentSetup.currentCosts;
  
  const cpcCost = ((mono * monoRate) + (colour * colourRate)) / 100;
  const leaseCost = (quarterlyLeaseCost || 0) / 3;
  const serviceCost = (quarterlyService || 0) / 3;
  
  return cpcCost + leaseCost + serviceCost;
});

// Pre-save middleware to calculate derived fields
quoteRequestSchema.pre('save', function(next) {
  // Calculate total volume
  if (this.monthlyVolume.mono && this.monthlyVolume.colour) {
    this.monthlyVolume.total = this.monthlyVolume.mono + this.monthlyVolume.colour;
    
    // Set volume range
    const total = this.monthlyVolume.total;
    if (total <= 6000) this.monthlyVolume.volumeRange = '0-6k';
    else if (total <= 13000) this.monthlyVolume.volumeRange = '6k-13k';
    else if (total <= 20000) this.monthlyVolume.volumeRange = '13k-20k';
    else if (total <= 30000) this.monthlyVolume.volumeRange = '20k-30k';
    else if (total <= 40000) this.monthlyVolume.volumeRange = '30k-40k';
    else if (total <= 50000) this.monthlyVolume.volumeRange = '40k-50k';
    else this.monthlyVolume.volumeRange = '50k+';
  }
  
  // Set default min speed based on volume
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

// Indexes for efficient querying
quoteRequestSchema.index({ 'monthlyVolume.volumeRange': 1 });
quoteRequestSchema.index({ 'paperRequirements.primarySize': 1 });
quoteRequestSchema.index({ submittedBy: 1 });
quoteRequestSchema.index({ status: 1 });
quoteRequestSchema.index({ createdAt: -1 });
quoteRequestSchema.index({ 'budget.maxLeasePrice': 1 });

const QuoteRequest = mongoose.model('QuoteRequest', quoteRequestSchema);
export default QuoteRequest;
