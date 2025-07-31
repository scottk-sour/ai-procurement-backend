// models/VendorProduct.js - Complete Enhanced Version
import mongoose from 'mongoose';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  },

  // AI Enhancement: Embedding for semantic matching
  embedding: { type: [Number], default: [] }  // Vector embedding array
}, { 
  timestamps: true,
  // Add virtual for backward compatibility
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals for display
vendorProductSchema.virtual('displayName').get(function() {
  return `${this.manufacturer} ${this.model}`;
});

vendorProductSchema.virtual('costDisplay').get(function() {
  const mono = this.costs.cpcRates.A4Mono;
  const colour = this.costs.cpcRates.A4Colour;
  if (colour > 0) {
    return `${mono}p mono, ${colour}p colour`;
  }
  return `${mono}p mono only`;
});

vendorProductSchema.virtual('volumeDisplay').get(function() {
  return `${this.minVolume.toLocaleString()} - ${this.maxVolume.toLocaleString()} pages/month`;
});

// Middleware to auto-calculate fields
vendorProductSchema.pre('save', async function(next) {
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

  // Enhanced: Generate embedding with better error handling
  if (this.isModified('description') || this.isModified('features') || this.isModified('model')) {
    try {
      // Only generate if OpenAI is configured
      if (!process.env.OPENAI_API_KEY) {
        console.warn('OpenAI API key not configured - skipping embedding generation');
        return next();
      }

      const text = `${this.manufacturer} ${this.model} ${this.description || ''} ${this.features?.join(' ') || ''}`;
      
      // Skip if text is too short
      if (text.trim().length < 10) {
        console.warn('Text too short for embedding generation');
        return next();
      }

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text.substring(0, 8000) // Limit text length
      });
      
      this.embedding = response.data[0].embedding;
      console.log(`✅ Generated embedding for ${this.manufacturer} ${this.model}`);
      
    } catch (error) {
      console.error('Error generating embedding for product:', {
        product: `${this.manufacturer} ${this.model}`,
        error: error.message
      });
      
      // Don't fail the save operation - just log and continue
      // Embedding is nice-to-have, not critical
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

// Static Methods for AI Matching

// Find products that match user requirements
vendorProductSchema.statics.findMatches = function(requirements) {
  const {
    monthlyVolume,
    paperSize,
    maxBudget,
    requiredFeatures,
    urgency,
    region,
    industry
  } = requirements;

  const query = {};

  // Volume matching
  if (monthlyVolume) {
    query.minVolume = { $lte: monthlyVolume };
    query.maxVolume = { $gte: monthlyVolume };
  }

  // Paper size matching
  if (paperSize) {
    query['paperSizes.supported'] = paperSize;
  }

  // Budget filtering
  if (maxBudget) {
    query['costs.totalMachineCost'] = { $lte: maxBudget };
  }

  // Feature requirements
  if (requiredFeatures && requiredFeatures.length > 0) {
    query.features = { $all: requiredFeatures };
  }

  // Availability based on urgency
  if (urgency === 'Critical' || urgency === 'High') {
    query['availability.inStock'] = true;
    query['availability.leadTime'] = { $lte: 14 };
  }

  // Geographic coverage
  if (region) {
    query.regionsCovered = region;
  }

  // Industry specialization
  if (industry) {
    query.industries = industry;
  }

  return this.find(query)
    .populate('vendorId', 'name company performance.rating')
    .sort({ 'costs.totalMachineCost': 1 });
};

// Get products by volume range
vendorProductSchema.statics.findByVolumeRange = function(monthlyVolume) {
  let volumeRange;
  
  if (monthlyVolume <= 6000) volumeRange = '0-6k';
  else if (monthlyVolume <= 13000) volumeRange = '6k-13k';
  else if (monthlyVolume <= 20000) volumeRange = '13k-20k';
  else if (monthlyVolume <= 30000) volumeRange = '20k-30k';
  else if (monthlyVolume <= 40000) volumeRange = '30k-40k';
  else if (monthlyVolume <= 50000) volumeRange = '40k-50k';
  else volumeRange = '50k+';

  return this.find({ volumeRange })
    .populate('vendorId', 'name company performance.rating');
};

// Semantic search using embeddings
vendorProductSchema.statics.semanticSearch = async function(searchText, limit = 10) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI not configured - falling back to text search');
    return this.find({
      $text: { $search: searchText }
    }).limit(limit);
  }

  try {
    // Generate embedding for search text
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: searchText
    });

    const searchEmbedding = response.data[0].embedding;

    // Use MongoDB vector search (requires Atlas Vector Search)
    return this.aggregate([
      {
        $vectorSearch: {
          index: 'product_embeddings',
          path: 'embedding',
          queryVector: searchEmbedding,
          numCandidates: limit * 10,
          limit: limit
        }
      },
      {
        $lookup: {
          from: 'vendors',
          localField: 'vendorId',
          foreignField: '_id',
          as: 'vendor'
        }
      }
    ]);

  } catch (error) {
    console.error('Semantic search failed:', error);
    // Fallback to text search
    return this.find({
      $text: { $search: searchText }
    }).limit(limit);
  }
};

// Find products by category and budget
vendorProductSchema.statics.findByCategoryAndBudget = function(category, maxBudget) {
  return this.find({
    category,
    'costs.totalMachineCost': { $lte: maxBudget },
    'availability.inStock': true
  }).sort({ 'costs.totalMachineCost': 1 });
};

// Get vendor's product statistics
vendorProductSchema.statics.getVendorStats = function(vendorId) {
  return this.aggregate([
    { $match: { vendorId: mongoose.Types.ObjectId(vendorId) } },
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        avgSpeed: { $avg: '$speed' },
        avgCost: { $avg: '$costs.totalMachineCost' },
        categories: { $addToSet: '$category' },
        volumeRanges: { $addToSet: '$volumeRange' },
        inStockCount: {
          $sum: { $cond: ['$availability.inStock', 1, 0] }
        }
      }
    }
  ]);
};

// Instance Methods

// Calculate total cost of ownership
vendorProductSchema.methods.calculateTCO = function(monthlyVolume, leaseTerm = 36) {
  const { mono = 0, colour = 0 } = monthlyVolume;
  
  // Get appropriate lease terms
  const leaseOption = this.leaseTermsAndMargins.find(l => l.term === leaseTerm) || 
                     this.leaseTermsAndMargins[0];
  
  if (!leaseOption) return null;

  // Calculate monthly costs
  const monthlyLease = (this.costs.totalMachineCost * leaseOption.margin) / leaseTerm;
  const monthlyCPC = (mono * this.costs.cpcRates.A4Mono + colour * this.costs.cpcRates.A4Colour) / 100;
  const monthlyService = this.service.quarterlyService / 3 || 50;
  
  const totalMonthlyCost = monthlyLease + monthlyCPC + monthlyService;
  const totalAnnualCost = totalMonthlyCost * 12;

  return {
    monthlyLease,
    monthlyCPC,
    monthlyService,
    totalMonthlyCost,
    totalAnnualCost,
    leaseTerm,
    breakdown: {
      lease: `£${monthlyLease.toFixed(2)}`,
      cpc: `£${monthlyCPC.toFixed(2)}`,
      service: `£${monthlyService.toFixed(2)}`
    }
  };
};

// Check if product matches requirements
vendorProductSchema.methods.matchesRequirements = function(requirements) {
  const {
    monthlyVolume,
    paperSize,
    maxBudget,
    requiredFeatures
  } = requirements;

  // Volume check
  if (monthlyVolume && (monthlyVolume < this.minVolume || monthlyVolume > this.maxVolume)) {
    return false;
  }

  // Paper size check
  if (paperSize && !this.paperSizes.supported.includes(paperSize)) {
    return false;
  }

  // Budget check
  if (maxBudget && this.costs.totalMachineCost > maxBudget) {
    return false;
  }

  // Feature requirements check
  if (requiredFeatures && requiredFeatures.length > 0) {
    const hasAllFeatures = requiredFeatures.every(feature => 
      this.features.includes(feature)
    );
    if (!hasAllFeatures) {
      return false;
    }
  }

  return true;
};

// Get matching score (0-1)
vendorProductSchema.methods.getMatchScore = function(requirements) {
  let score = 0;
  let totalCriteria = 0;

  const {
    monthlyVolume,
    paperSize,
    maxBudget,
    requiredFeatures,
    priority
  } = requirements;

  // Volume matching (30% weight)
  if (monthlyVolume) {
    totalCriteria += 30;
    if (monthlyVolume >= this.minVolume && monthlyVolume <= this.maxVolume) {
      // Perfect volume match gets full points
      const volumeRange = this.maxVolume - this.minVolume;
      const optimalVolume = this.minVolume + (volumeRange * 0.7); // Sweet spot at 70%
      const distance = Math.abs(monthlyVolume - optimalVolume) / volumeRange;
      score += 30 * (1 - distance);
    }
  }

  // Paper size matching (20% weight)
  if (paperSize) {
    totalCriteria += 20;
    if (this.paperSizes.supported.includes(paperSize)) {
      score += 20;
    }
  }

  // Budget efficiency (25% weight)
  if (maxBudget) {
    totalCriteria += 25;
    if (this.costs.totalMachineCost <= maxBudget) {
      const efficiency = (maxBudget - this.costs.totalMachineCost) / maxBudget;
      score += 25 * (0.5 + efficiency * 0.5); // Min 50%, max 100%
    }
  }

  // Feature matching (25% weight)
  if (requiredFeatures && requiredFeatures.length > 0) {
    totalCriteria += 25;
    const matchedFeatures = requiredFeatures.filter(feature => 
      this.features.includes(feature)
    );
    score += 25 * (matchedFeatures.length / requiredFeatures.length);
  }

  return totalCriteria > 0 ? score / totalCriteria : 0;
};

// Enhanced indexes for AI matching performance
vendorProductSchema.index({ volumeRange: 1, 'paperSizes.primary': 1 });
vendorProductSchema.index({ minVolume: 1, maxVolume: 1 });
vendorProductSchema.index({ vendorId: 1 });
vendorProductSchema.index({ category: 1 });
vendorProductSchema.index({ 'costs.totalMachineCost': 1 }); // Budget filtering
vendorProductSchema.index({ speed: 1 }); // Speed requirements
vendorProductSchema.index({ features: 1 }); // Feature matching
vendorProductSchema.index({ manufacturer: 1, category: 1 }); // Brand + type
vendorProductSchema.index({ 'availability.inStock': 1, 'availability.leadTime': 1 }); // Availability
vendorProductSchema.index({ 'service.responseTime': 1 }); // Service requirements
vendorProductSchema.index({ regionsCovered: 1 }); // Geographic matching
vendorProductSchema.index({ industries: 1 }); // Industry specialization

// Compound indexes for common AI queries
vendorProductSchema.index({ 
  category: 1, 
  volumeRange: 1, 
  'paperSizes.primary': 1,
  'costs.totalMachineCost': 1 
}); // Complete equipment matching

vendorProductSchema.index({ 
  'availability.inStock': 1,
  'service.responseTime': 1,
  regionsCovered: 1
}); // Service capability matching

// Text search index for description and features
vendorProductSchema.index({ 
  manufacturer: 'text',
  model: 'text', 
  description: 'text',
  features: 'text'
});

const VendorProduct = mongoose.model('VendorProduct', vendorProductSchema);
export default VendorProduct;
