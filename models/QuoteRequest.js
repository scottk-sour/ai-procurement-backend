import mongoose from 'mongoose';

const QuoteRequestSchema = new mongoose.Schema({
  // === STEP 1: Company Information ===
  companyName: { type: String, required: true },
  contactName: { type: String },
  email: { type: String, required: true },
  phone: { type: String },
  industryType: {
    type: String,
    enum: ['Healthcare', 'Legal', 'Education', 'Finance', 'Government', 'Manufacturing', 'Retail', 'Technology', 'Construction', 'Other'],
    required: true,
  },
  subSector: { type: String },
  numEmployees: {
    type: String,
    enum: ['1-10', '11-25', '26-50', '51-100', '101-250', '251-500', '500+'],
    required: true,
  },
  numLocations: { type: Number, default: 1 },
  multiFloor: { type: Boolean, default: false },
  annualRevenue: { type: String },
  officeBasedEmployees: { type: Number },
  primaryBusinessActivity: { type: String },
  
  // === STEP 2: Volume & Usage ===
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
  peakUsagePeriods: { type: String },
  documentTypes: [{ type: String }],
  averagePageCount: { type: String },
  
  // === STEP 3: Paper & Finishing Requirements ===
  paperRequirements: {
    primarySize: { type: String, enum: ['A4', 'A3', 'SRA3'], required: true },
    additionalSizes: [{ type: String, enum: ['A4', 'A3', 'SRA3', 'A5', 'Letter', 'Legal'] }],
    specialPaper: { type: Boolean, default: false },
    specialPaperTypes: [{ type: String }],
  },
  finishingRequirements: [{ type: String }],
  
  // === STEP 4: IT & Network Environment ===
  networkSetup: { type: String },
  itSupportStructure: { type: String },
  currentSoftwareEnvironment: { type: String },
  cloudPreference: { type: String },
  integrationNeeds: [{ type: String }],
  mobileRequirements: { type: Boolean, default: false },
  securityRequirements: [{ type: String }],
  // === STEP 5: Current Setup & Pain Points ===
  currentSetup: {
    machineAge: { 
      type: String, 
      enum: ['0-2 years', '2-5 years', '5+ years', 'No current machine', 'Not sure']
    },
    currentSupplier: { type: String },
    currentModel: { type: String },
    currentSpeed: { type: Number, default: 0 },
    contractStartDate: { type: Date },
    contractEndDate: { type: Date },
    currentMonoCPC: { type: Number, default: 0 },
    currentColorCPC: { type: Number, default: 0 },
    quarterlyLeaseCost: { type: Number, default: 0 },
    quarterlyService: { type: Number, default: 0 },
    currentFeatures: [{ type: String }],
    buyoutRequired: { type: Boolean, default: false },
    buyoutCost: { type: Number, default: 0 },
    painPoints: [{ type: String }],
    monthlySpend: { type: Number, default: 0 },
    annualSpend: { type: Number, default: 0 },
  },
  reasonsForQuote: [{ type: String }],
  currentPainPoints: { type: String },
  impactOnProductivity: { type: String },
  maintenanceIssues: { type: String },
  
  // === STEP 6: Technical Requirements ===
  colour: { type: String },
  type: { type: String },
  min_speed: { type: Number, default: 0 },
  required_functions: [{ type: String }],
  niceToHaveFeatures: [{ type: String }],
  securityFeatures: [{ type: String }],
  
  requirements: {
    minSpeed: { type: Number, default: 0 },
    priority: { type: String, enum: ['cost', 'speed', 'quality', 'reliability', 'balanced'] },
    essentialFeatures: [{ type: String }],
    niceToHaveFeatures: [{ type: String }],
    serviceLevel: { type: String, enum: ['Basic', 'Standard', 'Premium'] },
    responseTime: { type: String, enum: ['4hr', '8hr', 'Next day', '48hr'] },
  },
  
  // === STEP 7: Service & Support ===
  responseTimeExpectation: { type: String },
  maintenancePreference: { type: String },
  trainingNeeds: { type: String },
  supplyManagement: { type: String },
  reportingNeeds: [{ type: String }],
  additionalServices: [{ type: String }],
  
  // === STEP 8: Budget & Commercial ===
  budget: {
    maxLeasePrice: { type: Number, required: true },
    preferredTerm: { 
      type: String, 
      enum: ['12 months', '24 months', '36 months', '48 months', '60 months'],
      default: '60 months'
    },
  },
  preference: { type: String },
  decisionMakers: [{ type: String }],
  evaluationCriteria: [{ type: String }],
  contractLengthPreference: { type: String },
  pricingModelPreference: { type: String },
  max_lease_price: { type: Number, default: 0 },
  expectedGrowth: { type: String },
  expansionPlans: { type: String },
  technologyRoadmap: { type: String },
  digitalTransformation: { type: String },
  threeYearVision: { type: String },
  remoteWorkImpact: { type: String },
  
  // === STEP 9: Urgency & Timeline ===
  urgency: {
    timeframe: { 
      type: String, 
      enum: ['Immediately', '1-3 months', '3-6 months', '6+ months']
    },
    reason: { type: String },
  },
  urgencyLevel: { type: String },
  budgetCycle: { type: String },
  implementationTimeline: { type: String },
  
  // === Additional Fields ===
  location: {
    postcode: { type: String },
  },
  paysForScanning: { type: Boolean, default: false },
  accessibilityNeeds: { type: Boolean, default: false },
  sustainabilityGoals: { type: String },
  vendorRelationshipType: { type: String },
  roiExpectations: { type: String },
  totalAnnualCosts: { type: Number, default: 0 },
  hiddenCosts: { type: String },
  serviceProvider: { type: String },
  // === AI Analysis & System Fields ===
  aiAnalysis: {
    processed: { type: Boolean, default: false },
    processedAt: { type: Date },
    suggestedCategories: [{ type: String }],
    riskFactors: [{ type: String }],
  },
  
  // === System & Metadata ===
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'matched', 'completed', 'accepted', 'declined'],
    default: 'pending',
  },
  submissionSource: { 
    type: String, 
    enum: ['web_form', 'phone', 'email', 'admin'], 
    default: 'web_form' 
  },
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
  // Calculate total volume and volume range
  if (this.monthlyVolume.mono !== undefined && this.monthlyVolume.colour !== undefined) {
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
  
  // Auto-suggest minimum speed based on volume
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

// Indexes for performance
QuoteRequestSchema.index({ 'monthlyVolume.volumeRange': 1 });
QuoteRequestSchema.index({ 'paperRequirements.primarySize': 1 });
QuoteRequestSchema.index({ submittedBy: 1 });
QuoteRequestSchema.index({ userId: 1 });
QuoteRequestSchema.index({ status: 1 });
QuoteRequestSchema.index({ createdAt: -1 });
QuoteRequestSchema.index({ 'budget.maxLeasePrice': 1 });
QuoteRequestSchema.index({ industryType: 1 });
QuoteRequestSchema.index({ numEmployees: 1 });

export default mongoose.model('QuoteRequest', QuoteRequestSchema);
