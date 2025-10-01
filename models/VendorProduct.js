import mongoose from 'mongoose';

const vendorProductSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
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
    enum: ['A4 Printers', 'A4 MFP', 'A3 MFP', 'SRA3 MFP'],
    required: true,
  },
  speed: {
    type: Number,
    required: true,
  },
  isA3: {
    type: Boolean,
    default: false,
  },
  features: [{ type: String }],
  minVolume: {
    type: Number,
    required: true,
  },
  maxVolume: {
    type: Number,
    required: true,
  },
  volumeRange: {
    type: String,
    enum: ['0-6k', '6k-13k', '13k-20k', '20k-30k', '30k-40k', '40k-50k', '50k+'],
    required: true,
  },
  paperSizes: {
    primary: {
      type: String,
      enum: ['A4', 'A3', 'SRA3'],
      required: true,
    },
    supported: [{
      type: String,
      enum: ['A4', 'A3', 'SRA3', 'A5', 'Letter', 'Legal'],
    }],
  },
  costs: {
    machineCost: { type: Number, required: true },
    installation: { type: Number, default: 250 },
    profitMargin: { type: Number, required: true },
    totalMachineCost: { type: Number, required: true },
    cpcRates: {
      A4Mono: { type: Number, required: true },
      A4Colour: { type: Number, required: true },
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
  },
  availability: {
    inStock: { type: Boolean, default: true },
    leadTime: { type: Number, default: 14 },
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
  const mono = this.costs.cpcRates.A4Mono;
  const colour = this.costs.cpcRates.A4Colour;
  if (colour > 0) {
    return `${mono}p mono, ${colour}p colour`;
  }
  return `${mono}p mono only`;
});

vendorProductSchema.virtual('volumeDisplay').get(function () {
  return `${this.minVolume.toLocaleString()} - ${this.maxVolume.toLocaleString()} pages/month`;
});

// Pre-save middleware
vendorProductSchema.pre('save', function (next) {
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
  next();
});

// Validation
vendorProductSchema.path('minVolume').validate(function (value) {
  return value < this.maxVolume;
}, 'minVolume must be less than maxVolume');

vendorProductSchema.path('costs.totalMachineCost').validate(function (value) {
  if (this.costs.machineCost && this.costs.installation && this.costs.profitMargin) {
    const calculated = this.costs.machineCost + this.costs.installation + this.costs.profitMargin;
    return Math.abs(value - calculated) < 1;
  }
  return true;
}, 'totalMachineCost must equal machineCost + installation + profitMargin');

// Static method for AI matching
vendorProductSchema.statics.findMatches = function (requirements) {
  const { monthlyVolume, paperSize, maxBudget, requiredFeatures, urgency } = requirements;
  const query = {};
  if (monthlyVolume?.total) {
    query.minVolume = { $lte: monthlyVolume.total };
    query.maxVolume = { $gte: monthlyVolume.total };
  }
  if (paperSize) {
    query['paperSizes.supported'] = paperSize;
  }
  if (maxBudget) {
    query['costs.totalMachineCost'] = { $lte: maxBudget };
  }
  if (requiredFeatures && requiredFeatures.length > 0) {
    query.features = { $all: requiredFeatures };
  }
  if (urgency === 'Immediately') {
    query['availability.inStock'] = true;
    query['availability.leadTime'] = { $lte: 7 };
  }
  return this.find(query)
    .populate('vendorId', 'name company performance.rating')
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

export default mongoose.model('VendorProduct', vendorProductSchema);
