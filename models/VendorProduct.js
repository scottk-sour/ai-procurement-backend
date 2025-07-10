// Updated VendorProduct.js to match your matrix structure
import mongoose from 'mongoose';

const AuxiliarySchema = new mongoose.Schema({
  item: { type: String, required: true },
  price: { type: Number, required: true }
}, { _id: false });

const LeaseTermsAndMarginsSchema = new mongoose.Schema({
  term: { type: Number, required: true },     // in months (12, 24, 36, 48, 60, etc.)
  margin: { type: Number, required: true }    // as decimal, e.g., 0.5 for 50%
}, { _id: false });

const vendorProductSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  
  // Basic Product Info
  manufacturer: { type: String, required: true },
  model: { type: String, required: true },
  description: { type: String },
  category: { type: String, enum: ['A4 Printers', 'A4 MFP', 'A3 MFP', 'SRA3 MFP'], required: true },
  
  // Performance & Specs
  speed: { type: Number, required: true }, // ppm
  isA3: { type: Boolean, default: false },
  features: [{ type: String }], // e.g., ["scan", "fax", "booklet finisher"]
  
  // Volume Capacity (CRITICAL for matching)
  minVolume: { type: Number, required: true },
  maxVolume: { type: Number, required: true },
  volumeRange: { 
    type: String, 
    enum: ['0-6k', '6k-13k', '13k-20k', '20k-30k', '30k-40k', '40k-50k', '50k+'],
    required: true 
  },
  
  // Paper Size Support (CRITICAL for matching)
  paperSizes: {
    primary: { 
      type: String, 
      enum: ['A4', 'A3', 'SRA3'], 
      required: true 
    },
    supported: [{ 
      type: String, 
      enum: ['A4', 'A3', 'SRA3', 'A5'] 
    }]
  },
  
  // Cost Structure (matching your matrix)
  costs: {
    machineCost: { type: Number, required: true },
    installation: { type: Number, default: 250 },
    profitMargin: { type: Number, required: true },
    totalMachineCost: { type: Number, required: true }, // machineCost + installation + profitMargin
    
    // CPC Rates (in pence per page)
    cpcRates: {
      A4Mono: { type: Number, required: true },
      A4Colour: { type: Number, required: true },
      A3Mono: { type: Number },
      A3Colour: { type: Number },
      SRA3Mono: { type: Number },
      SRA3Colour: { type: Number }
    }
  },
  
  // Legacy fields (for backward compatibility)
  salePrice: { type: Number }, // Will map to costs.totalMachineCost
  A4MonoCPC: { type: Number }, // Will map to costs.cpcRates.A4Mono
  A4ColourCPC: { type: Number }, // Will map to costs.cpcRates.A4Colour
  A3MonoCPC: { type: Number }, // Will map to costs.cpcRates.A3Mono
  A3ColourCPC: { type: Number }, // Will map to costs.cpcRates.A3Colour
  
  // Lease Options
  leaseTermsAndMargins: [LeaseTermsAndMarginsSchema],
  
  // Accessories
  auxiliaries: [AuxiliarySchema],
  
  // Service & Support
  service: {
    level: { type: String, enum: ['Basic', 'Standard', 'Premium'] },
    responseTime: { type: String, enum: ['4hr', '8hr', 'Next day'] },
    quarterlyService: { type: Number },
    support: { type: String }
  },
  
  // Additional fields
  adminFee: { type: Number, default: 0 },
  minMonthlyCPC: { type: Number, default: 0 },
  stockStatus: { type: String, enum: ['In Stock', 'Order', 'Discontinued'] },
  modelYear: { type: Number },
  complianceTags: [{ type: String }],
  regionsCovered: [{ type: String }],
  industries: [{ type: String }],
  
  // Availability
  availability: {
    inStock: { type: Boolean, default: true },
    leadTime: { type: Number, default: 14 }, // days
    installationWindow: { type: Number, default: 7 } // days
  }
}, { 
  timestamps: true,
  // Add virtual for backward compatibility
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Middleware to auto-calculate fields
vendorProductSchema.pre('save', function(next) {
  // Auto-calculate total machine cost if not provided
  if (this.costs && this.costs.machineCost && this.costs.installation && this.costs.profitMargin) {
    this.costs.totalMachineCost = this.costs.machineCost + this.costs.installation + this.costs.profitMargin;
  }
  
  // Set legacy fields for backward compatibility
  if (this.costs) {
    this.salePrice = this.costs.totalMachineCost;
    this.A4MonoCPC = this.costs.cpcRates?.A4Mono;
    this.A4ColourCPC = this.costs.cpcRates?.A4Colour;
    this.A3MonoCPC = this.costs.cpcRates?.A3Mono;
    this.A3ColourCPC = this.costs.cpcRates?.A3Colour;
  }
  
  // Auto-calculate volume range
  if (this.maxVolume) {
    if (this.maxVolume <= 6000) this.volumeRange = '0-6k';
    else if (this.maxVolume <= 13000) this.volumeRange = '6k-13k';
    else if (this.maxVolume <= 20000) this.volumeRange = '13k-20k';
    else if (this.maxVolume <= 30000) this.volumeRange = '20k-30k';
    else if (this.maxVolume <= 40000) this.volumeRange = '30k-40k';
    else if (this.maxVolume <= 50000) this.volumeRange = '40k-50k';
    else this.volumeRange = '50k+';
  }
  
  // Auto-set paper sizes if not provided
  if (!this.paperSizes?.supported || this.paperSizes.supported.length === 0) {
    if (this.paperSizes?.primary) {
      this.paperSizes.supported = [this.paperSizes.primary];
      
      // Add logical additional sizes
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
vendorProductSchema.path('minVolume').validate(function(value) {
  return value < this.maxVolume;
}, 'minVolume must be less than maxVolume');

vendorProductSchema.path('costs.totalMachineCost').validate(function(value) {
  if (this.costs.machineCost && this.costs.installation && this.costs.profitMargin) {
    const calculated = this.costs.machineCost + this.costs.installation + this.costs.profitMargin;
    return Math.abs(value - calculated) < 1; // Allow small rounding differences
  }
  return true;
}, 'totalMachineCost must equal machineCost + installation + profitMargin');

// Indexes for efficient querying
vendorProductSchema.index({ volumeRange: 1, 'paperSizes.primary': 1 });
vendorProductSchema.index({ minVolume: 1, maxVolume: 1 });
vendorProductSchema.index({ vendorId: 1 });
vendorProductSchema.index({ category: 1 });

const VendorProduct = mongoose.model('VendorProduct', vendorProductSchema);
export default VendorProduct;