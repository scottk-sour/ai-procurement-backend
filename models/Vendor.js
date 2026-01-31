// models/Vendor.js - FIXED VERSION
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto'; // ADDED: ES modules import

const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms', 'Security', 'Software'];

const vendorSchema = new mongoose.Schema({
  // Core Identity
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  company: { 
    type: String, 
    required: true, 
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/.+@.+\..+/, 'Please provide a valid email address'],
    index: true,
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },

  // Business Profile
  services: {
    type: [String],
    required: true,
    validate: {
      validator: function(arr) {
        return arr.length > 0 && arr.every((service) => validServices.includes(service));
      },
      message: 'Must provide at least one valid service. Allowed: ' + validServices.join(', '),
    },
  },

  // Location & Contact
  location: {
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    postcode: { type: String, trim: true, default: '' },
    region: { type: String, trim: true, default: '' },
    coverage: [{ type: String, trim: true }], // ["London", "Birmingham", "Manchester"]
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number }
    }
  },

  contactInfo: {
    phone: {
      type: String,
      match: [/^\+?\d{10,15}$/, 'Please provide a valid phone number'],
      default: '',
    },
    website: { 
      type: String, 
      trim: true,
      match: [/^https?:\/\/.+/, 'Please provide a valid website URL'],
      default: ''
    },
    linkedIn: { type: String, trim: true, default: '' },
    alternativeContact: {
      name: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' }
    }
  },

  // Business Details
  businessProfile: {
    yearsInBusiness: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    companySize: {
      type: String,
      enum: ['Startup', 'Small (1-50)', 'Medium (51-200)', 'Large (201-1000)', 'Enterprise (1000+)', ''],
      default: 'Small (1-50)'
    },
    numEmployees: { type: Number, default: 0 },
    specializations: [{ type: String, trim: true }], // ["Healthcare", "Education", "Finance"]
    certifications: [{ type: String, trim: true }], // ["ISO9001", "ISO27001"]
    accreditations: [{ type: String, trim: true }], // ["Konica Minolta Authorized", "Canon Partner"]
    description: { type: String, trim: true, default: '' },
  },

  // Brand partnerships
  brands: [{ type: String, trim: true }], // ["Canon", "Konica Minolta", "Ricoh"]

  // Postcode areas for geographic matching (extracted from postcode)
  postcodeAreas: [{
    type: String,
    uppercase: true,
    trim: true
  }],

  // Performance & Reputation
  performance: {
    rating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be less than 0'],
      max: [5, 'Rating cannot exceed 5'],
    },
    reviewCount: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 }, // hours
    completionRate: { type: Number, default: 0 }, // percentage
    customerSatisfaction: { type: Number, default: 0 }, // percentage
    onTimeDelivery: { type: Number, default: 0 }, // percentage
  },

  // Service Capabilities
  serviceCapabilities: {
    responseTime: { 
      type: String, 
      enum: ['4hr', '8hr', 'Next day', '48hr', '3-5 days'],
      default: 'Next day' 
    },
    supportHours: { 
      type: String, 
      enum: ['9-5', '8-6', '24/7', 'Extended hours'],
      default: '9-5' 
    },
    installationService: { type: Boolean, default: true },
    maintenanceService: { type: Boolean, default: true },
    trainingProvided: { type: Boolean, default: false },
    remoteSupport: { type: Boolean, default: false },
    emergencySupport: { type: Boolean, default: false }
  },

  // Financial & Commercial
  commercial: {
    creditRating: { 
      type: String, 
      enum: ['Excellent', 'Good', 'Fair', 'Poor', 'Unknown'],
      default: 'Unknown'
    },
    paymentTerms: { 
      type: String, 
      enum: ['Net 30', 'Net 60', 'COD', 'Advance payment'],
      default: 'Net 30' 
    },
    minimumOrderValue: { type: Number, default: 0 },
    discountThresholds: [{
      volumeThreshold: { type: Number },
      discountPercentage: { type: Number }
    }],
    preferredLeasePartners: [{ type: String, trim: true }] // ["ABC Leasing", "XYZ Finance"]
  },

  // Account Status & Management
  account: {
    status: {
      type: String,
      default: 'pending',
      enum: ['pending', 'active', 'inactive', 'suspended', 'rejected'],
    },
    verificationStatus: {
      type: String,
      default: 'unverified',
      enum: ['unverified', 'pending', 'verified', 'rejected']
    },
    tier: {
      type: String,
      default: 'standard',
      enum: ['bronze', 'silver', 'gold', 'platinum', 'standard']
    },
    lastLogin: { type: Date },
    loginCount: { type: Number, default: 0 },
    agreementsSigned: [{
      type: { type: String }, // "Terms of Service", "Data Processing Agreement"
      signedAt: { type: Date },
      version: { type: String }
    }]
  },

  // Stripe & Subscription
  stripeCustomerId: { type: String, sparse: true, index: true },
  stripeSubscriptionId: { type: String, sparse: true },
  tier: {
    type: String,
    default: 'free',
    enum: ['free', 'basic', 'managed', 'enterprise', 'listed', 'visible', 'verified']
  },
  subscriptionStatus: {
    type: String,
    default: 'none',
    enum: ['none', 'active', 'past_due', 'cancelled', 'trialing', 'incomplete']
  },
  subscriptionEndDate: { type: Date },
  subscriptionCurrentPeriodEnd: { type: Date },

  // Platform Integration
  integration: {
    apiKey: { type: String, unique: true, sparse: true },
    webhookUrl: { type: String, trim: true },
    autoQuoteGeneration: { type: Boolean, default: false },
    productCatalogUrl: { type: String, trim: true },
    pricingUpdateFrequency: { 
      type: String, 
      enum: ['Manual', 'Daily', 'Weekly', 'Monthly'],
      default: 'Manual' 
    }
  },

  // Notes & Communication
  notes: [{
    note: { type: String, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
    type: { type: String, enum: ['admin', 'system', 'vendor'], default: 'admin' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
  }],

  // Listing Claim Status (for imported vendors)
  listingStatus: {
    type: String,
    enum: ['unclaimed', 'claimed', 'verified', 'suspended'],
    default: 'unclaimed'
  },

  claimedAt: {
    type: Date
  },

  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Import metadata
  importedAt: {
    type: Date
  },

  importSource: {
    type: String,
    trim: true
  }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
vendorSchema.virtual('productCount', {
  ref: 'VendorProduct',
  localField: '_id',
  foreignField: 'vendorId',
  count: true
});

vendorSchema.virtual('activeQuoteCount', {
  ref: 'Quote',
  localField: '_id',
  foreignField: 'vendor',
  count: true,
  match: { status: { $in: ['sent', 'viewed'] } }
});

// Pre-save middleware for password hashing
vendorSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// FIXED: Generate API key if needed - using ES modules crypto import
vendorSchema.pre('save', function(next) {
  if (!this.integration.apiKey && this.account.status === 'active') {
    this.integration.apiKey = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Instance Methods
vendorSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

vendorSchema.methods.updateLastLogin = function() {
  this.account.lastLogin = new Date();
  this.account.loginCount += 1;
  return this.save();
};

vendorSchema.methods.isActive = function() {
  return this.account.status === 'active' && this.account.verificationStatus === 'verified';
};

// Static Methods
vendorSchema.statics.findByService = function(service) {
  return this.find({ 
    services: service,
    'account.status': 'active',
    'account.verificationStatus': 'verified'
  });
};

vendorSchema.statics.findByRegion = function(region) {
  return this.find({ 
    'location.coverage': region,
    'account.status': 'active'
  });
};

// Indexes
vendorSchema.index({ email: 1 }, { unique: true });
vendorSchema.index({ company: 1 });
vendorSchema.index({ services: 1 });
vendorSchema.index({ 'location.coverage': 1 });
vendorSchema.index({ 'account.status': 1, 'account.verificationStatus': 1 });
vendorSchema.index({ 'performance.rating': -1 });
vendorSchema.index({ 'integration.apiKey': 1 }, { sparse: true });
vendorSchema.index({ listingStatus: 1 });
vendorSchema.index({ postcodeAreas: 1 });
vendorSchema.index({ brands: 1 });

const Vendor = mongoose.model('Vendor', vendorSchema);
export default Vendor;
