import mongoose from 'mongoose';

const vendorProductSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
  },
  serviceCategory: {
    type: String,
    enum: ['Photocopiers', 'Telecoms', 'CCTV', 'IT'],
    required: true,
    default: 'Photocopiers',
    index: true,
  },
  manufacturer: {
    type: String,
    required: true,
  },
  model: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  category: {
    type: String,
    enum: [
      'A4 Printers', 'A4 MFP', 'A3 MFP', 'SRA3 MFP',
      'Cloud VoIP', 'On-Premise PBX', 'Microsoft Teams', 'Hybrid Phone System',
      'IP Camera System', 'Analogue System', 'Hybrid CCTV', 'Cloud-Based CCTV',
      'Fully Managed IT', 'Co-Managed IT', 'Project-Based IT', 'IT Consultancy',
    ],
    required: true,
  },
  speed: {
    type: Number,
    required: function() { return this.serviceCategory === 'Photocopiers'; },
  },
  isA3: {
    type: Boolean,
    default: false,
  },
  // Colour capability - can be set explicitly or derived from cpcRates.A4Colour > 0
  isColour: {
    type: Boolean,
    default: true,
  },
  features: [{ type: String }],
  minVolume: {
    type: Number,
    required: function() { return this.serviceCategory === 'Photocopiers'; },
  },
  maxVolume: {
    type: Number,
    required: function() { return this.serviceCategory === 'Photocopiers'; },
  },
  volumeRange: {
    type: String,
    enum: ['0-6k', '6k-13k', '13k-20k', '20k-30k', '30k-40k', '40k-50k', '50k+'],
    required: function() { return this.serviceCategory === 'Photocopiers'; },
  },
  paperSizes: {
    primary: {
      type: String,
      enum: ['A4', 'A3', 'SRA3'],
      required: function() { return this.serviceCategory === 'Photocopiers'; },
    },
    supported: [{
      type: String,
      enum: ['A4', 'A3', 'SRA3', 'A5', 'Letter', 'Legal'],
    }],
  },
  costs: {
    machineCost: { type: Number, required: function() { return this.serviceCategory === 'Photocopiers'; } },
    installation: { type: Number, default: 250 },
    profitMargin: { type: Number, required: function() { return this.serviceCategory === 'Photocopiers'; } },
    totalMachineCost: { type: Number, required: function() { return this.serviceCategory === 'Photocopiers'; } },
    cpcRates: {
      A4Mono: { type: Number, required: function() { return this.serviceCategory === 'Photocopiers'; } },
      A4Colour: { type: Number, required: function() { return this.serviceCategory === 'Photocopiers'; } },
      A3Mono: { type: Number },
      A3Colour: { type: Number },
      SRA3Mono: { type: Number },
      SRA3Colour: { type: Number },
    },
  },
  service: {
    level: { type: String, enum: ['Basic', 'Standard', 'Premium'] },
    responseTime: { type: String, enum: ['4hr', '8hr', 'Next day'] },
    quarterlyService: { type: Number },
    // What's included in the service contract
    includesToner: { type: Boolean, default: true },
    includesPartsLabour: { type: Boolean, default: true },
    includesDrums: { type: Boolean, default: true },
    includesStaples: { type: Boolean, default: false },
    // Service notes for anything non-standard
    notes: { type: String, trim: true },
  },
  availability: {
    inStock: { type: Boolean, default: true },
    leadTime: { type: Number, default: 14 },
  },

  // Lease rates - quarterly payments by term length
  leaseRates: {
    term36: { type: Number },  // Quarterly payment for 36 month term
    term48: { type: Number },  // Quarterly payment for 48 month term
    term60: { type: Number },  // Quarterly payment for 60 month term
    term72: { type: Number },  // Optional 72 month term
  },

  // Telecoms pricing
  telecomsPricing: {
    systemType: { type: String, enum: ['Cloud VoIP', 'On-Premise PBX', 'Microsoft Teams', 'Hybrid'] },
    perUserMonthly: { type: Number },
    minUsers: { type: Number },
    maxUsers: { type: Number },
    handsetCost: { type: Number },
    handsetModel: { type: String },
    callPackage: {
      packageType: { type: String, enum: ['Unlimited UK', 'Unlimited UK + Mobiles', 'Pay per minute', 'Bundled minutes'] },
      includedMinutes: { type: Number },
      perMinuteRate: { type: Number },
    },
    broadbandIncluded: { type: Boolean, default: false },
    broadbandSpeed: { type: String },
    broadbandMonthlyCost: { type: Number },
    setupFee: { type: Number },
    contractTermMonths: { type: Number },
    features: [{ type: String }],
    numberPortingFee: { type: Number },
  },

  // CCTV pricing
  cctvPricing: {
    systemType: { type: String, enum: ['IP Camera System', 'Analogue', 'Hybrid', 'Cloud-Based'] },
    perCameraCost: { type: Number },
    cameraModel: { type: String },
    resolution: { type: String, enum: ['HD 1080p', '2K 1440p', '4K 2160p'] },
    indoor: { type: Boolean },
    outdoor: { type: Boolean },
    nightVision: { type: Boolean, default: true },
    nvrCost: { type: Number },
    nvrChannels: { type: Number },
    installationPerCamera: { type: Number },
    installationFlat: { type: Number },
    monthlyMonitoring: { type: Number },
    cloudStorageMonthly: { type: Number },
    cloudStoragePerCamera: { type: Number },
    maintenanceAnnual: { type: Number },
    contractTermMonths: { type: Number },
    features: [{ type: String }],
    minCameras: { type: Number },
    maxCameras: { type: Number },
  },

  // IT pricing
  itPricing: {
    serviceType: { type: String, enum: ['Fully Managed', 'Co-Managed', 'Project-Based', 'Consultancy'] },
    perUserMonthly: { type: Number },
    perDeviceMonthly: { type: Number },
    minUsers: { type: Number },
    maxUsers: { type: Number },
    serverManagementMonthly: { type: Number },
    includes: [{ type: String }],
    m365LicenceIncluded: { type: Boolean, default: false },
    m365CostPerUser: { type: Number },
    cybersecurityAddon: { type: Number },
    backupPerGb: { type: Number },
    setupFee: { type: Number },
    projectDayRate: { type: Number },
    contractTermMonths: { type: Number },
    responseTimeSLA: { type: String, enum: ['1 hour', '2 hours', '4 hours', '8 hours', 'Next business day'] },
    supportHours: { type: String, enum: ['24/7', 'Business hours (8-6)', 'Extended (7-10)', 'Business hours (9-5)'] },
    accreditations: [{ type: String }],
  },

  minimumQuarterlyCharge: {
    type: Number,
    default: 0
  },

  // Product status - active products show in catalog
  status: {
    type: String,
    enum: ['active', 'inactive', 'draft'],
    default: 'active'
  },

  // Legacy field for backwards compatibility
  isActive: {
    type: Boolean,
    default: true
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtuals
vendorProductSchema.virtual('displayName').get(function () {
  return `${this.manufacturer} ${this.model}`;
});

vendorProductSchema.virtual('costDisplay').get(function () {
  if (this.serviceCategory !== 'Photocopiers' || !this.costs?.cpcRates) return null;
  const mono = this.costs.cpcRates.A4Mono;
  const colour = this.costs.cpcRates.A4Colour;
  if (colour > 0) {
    return `${mono}p mono, ${colour}p colour`;
  }
  return `${mono}p mono only`;
});

vendorProductSchema.virtual('volumeDisplay').get(function () {
  if (this.serviceCategory !== 'Photocopiers') return null;
  return `${this.minVolume.toLocaleString()} - ${this.maxVolume.toLocaleString()} pages/month`;
});

// Pre-validate middleware (runs before required checks)
vendorProductSchema.pre('validate', function (next) {
  if (this.serviceCategory === 'Photocopiers') {
    if (this.costs && this.costs.machineCost && this.costs.installation && this.costs.profitMargin) {
      this.costs.totalMachineCost = this.costs.machineCost + this.costs.installation + this.costs.profitMargin;
    }
    if (this.maxVolume) {
      if (this.maxVolume <= 6000) this.volumeRange = '0-6k';
      else if (this.maxVolume <= 13000) this.volumeRange = '6k-13k';
      else if (this.maxVolume <= 20000) this.volumeRange = '13k-20k';
      else if (this.maxVolume <= 30000) this.volumeRange = '20k-30k';
      else if (this.maxVolume <= 40000) this.volumeRange = '30k-40k';
      else if (this.maxVolume <= 50000) this.volumeRange = '40k-50k';
      else this.volumeRange = '50k+';
    }
    if (!this.paperSizes?.supported || this.paperSizes.supported.length === 0) {
      if (this.paperSizes?.primary) {
        this.paperSizes.supported = [this.paperSizes.primary];
        if (this.paperSizes.primary === 'SRA3') {
          this.paperSizes.supported.push('A3', 'A4');
        } else if (this.paperSizes.primary === 'A3') {
          this.paperSizes.supported.push('A4');
        }
      }
    }
  }
  next();
});

// Validation
vendorProductSchema.path('minVolume').validate(function (value) {
  if (this.serviceCategory !== 'Photocopiers') return true;
  return value < this.maxVolume;
}, 'minVolume must be less than maxVolume');

vendorProductSchema.path('costs.totalMachineCost').validate(function (value) {
  if (this.serviceCategory !== 'Photocopiers') return true;
  if (this.costs.machineCost && this.costs.installation && this.costs.profitMargin) {
    const calculated = this.costs.machineCost + this.costs.installation + this.costs.profitMargin;
    return Math.abs(value - calculated) < 1;
  }
  return true;
}, 'totalMachineCost must equal machineCost + installation + profitMargin');

// Static method for AI matching
vendorProductSchema.statics.findMatches = function (requirements) {
  const { monthlyVolume, paperSize, maxBudget, requiredFeatures, urgency, colour, a3 } = requirements;
  const query = { status: 'active' };

  // Volume matching
  if (monthlyVolume?.total) {
    query.minVolume = { $lte: monthlyVolume.total };
    query.maxVolume = { $gte: monthlyVolume.total };
  }

  // Paper size matching
  if (paperSize) {
    query['paperSizes.supported'] = paperSize;
  }

  // A3 capability filter
  if (a3 === true) {
    query.isA3 = true;
  }

  // Colour capability filter
  if (colour === true) {
    query.isColour = true;
  } else if (colour === false) {
    // Mono only - either isColour is false or A4Colour CPC is 0
    query.$or = [
      { isColour: false },
      { 'costs.cpcRates.A4Colour': 0 }
    ];
  }

  // Budget filter
  if (maxBudget) {
    query['costs.totalMachineCost'] = { $lte: maxBudget };
  }

  // Features filter
  if (requiredFeatures && requiredFeatures.length > 0) {
    query.features = { $all: requiredFeatures };
  }

  // Urgency filter
  if (urgency === 'Immediately' || urgency === 'urgent') {
    query['availability.inStock'] = true;
    query['availability.leadTime'] = { $lte: 7 };
  }

  return this.find(query)
    .populate('vendorId', 'name company performance.rating tier')
    .sort({ 'costs.totalMachineCost': 1 });
};

// Indexes
vendorProductSchema.index({ volumeRange: 1, 'paperSizes.primary': 1 });
vendorProductSchema.index({ minVolume: 1, maxVolume: 1 });
vendorProductSchema.index({ vendorId: 1 });
vendorProductSchema.index({ category: 1 });
vendorProductSchema.index({ 'costs.totalMachineCost': 1 });
vendorProductSchema.index({ speed: 1 });
vendorProductSchema.index({ features: 1 });
vendorProductSchema.index({ serviceCategory: 1, vendorId: 1 });
vendorProductSchema.index({ 'telecomsPricing.minUsers': 1, 'telecomsPricing.maxUsers': 1 });
vendorProductSchema.index({ 'cctvPricing.minCameras': 1, 'cctvPricing.maxCameras': 1 });
vendorProductSchema.index({ 'itPricing.minUsers': 1, 'itPricing.maxUsers': 1 });

export default mongoose.model('VendorProduct', vendorProductSchema);
