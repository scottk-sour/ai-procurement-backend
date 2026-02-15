// models/VendorLead.js
// Simplified quote requests from vendor profile pages (no auth required)

import mongoose from 'mongoose';

const vendorLeadSchema = new mongoose.Schema({
  // Vendor receiving the request
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },

  // Service requirements
  service: {
    type: String,
    enum: ['Photocopiers', 'Telecoms', 'CCTV', 'IT', 'Security', 'Software', 'Other'],
    required: true
  },
  equipmentType: String,
  monthlyVolume: {
    type: String,
    enum: ['low', 'medium', 'high', 'enterprise', 'not-sure']
  },
  // Specific volume for accurate product matching (pages/month)
  specificVolume: {
    type: Number,
    min: 0,
    max: 1000000
  },
  // Photocopier-specific requirements
  colour: {
    type: Boolean,
    default: null  // null = not specified
  },
  a3: {
    type: Boolean,
    default: null  // null = not specified
  },
  currentSetup: {
    type: String,
    enum: ['none', 'outdated', 'leased', 'owned', 'multiple']
  },
  // Current provider details (for savings calculation)
  currentProvider: {
    name: { type: String, trim: true },
    contractEndDate: { type: Date },
    monthlyCost: { type: String, trim: true },
    satisfactionLevel: {
      type: String,
      enum: ['very-happy', 'happy', 'neutral', 'unhappy', 'very-unhappy']
    }
  },
  currentMonthlyCost: {
    type: Number,
    min: 0
  },
  features: [{
    type: String
  }],

  // Flexible storage for all category-specific answers
  requirements: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Timeline and budget
  timeline: {
    type: String,
    enum: ['urgent', 'soon', 'planning', 'future']
  },
  contractPreference: {
    type: String,
    enum: ['lease', 'purchase', 'managed', 'flexible']
  },
  budgetRange: {
    type: String,
    enum: ['under-100', '100-250', '250-500', '500-1000', 'over-1000', 'discuss']
  },

  // Customer details
  customer: {
    companyName: {
      type: String,
      required: true,
      trim: true
    },
    contactName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, 'Please provide a valid email']
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    postcode: {
      type: String,
      trim: true
    },
    message: {
      type: String,
      trim: true,
      maxlength: 2000
    }
  },

  // Request status
  status: {
    type: String,
    enum: ['pending', 'viewed', 'contacted', 'quoted', 'won', 'lost', 'expired'],
    default: 'pending',
    index: true
  },

  // Tracking timestamps
  viewedAt: Date,
  contactedAt: Date,
  quotedAt: Date,
  closedAt: Date,

  // Source tracking
  source: {
    page: String,
    referrer: String,
    utm: {
      source: String,
      medium: String,
      campaign: String
    }
  },

  // Vendor notes
  vendorNotes: [{
    note: String,
    addedAt: { type: Date, default: Date.now }
  }],

  // Quote value (if quoted)
  quoteValue: {
    amount: Number,
    currency: { type: String, default: 'GBP' }
  },

  // Review token fields (for verified reviews)
  reviewToken: {
    type: String,
    index: true
  },
  reviewTokenExpires: {
    type: Date
  },
  reviewRequested: {
    type: Boolean,
    default: false
  },
  reviewRequestedAt: {
    type: Date
  },
  reviewSubmitted: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// Indexes for common queries
vendorLeadSchema.index({ vendor: 1, status: 1 });
vendorLeadSchema.index({ vendor: 1, createdAt: -1 });
vendorLeadSchema.index({ 'customer.email': 1 });

// Virtual for age in days
vendorLeadSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Mark as viewed
vendorLeadSchema.methods.markViewed = function() {
  if (this.status === 'pending') {
    this.status = 'viewed';
    this.viewedAt = new Date();
  }
  return this.save();
};

export default mongoose.model('VendorLead', vendorLeadSchema);
