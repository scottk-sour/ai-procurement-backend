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
    enum: ['Under 1,000', '1,000 - 5,000', '5,000 - 10,000', '10,000 - 25,000', '25,000+', 'Not sure']
  },
  currentSetup: {
    type: String,
    enum: ['New setup', 'Replacing existing', 'Adding to fleet', 'Not sure']
  },
  features: [{
    type: String
  }],

  // Timeline and budget
  timeline: {
    type: String,
    enum: ['ASAP', 'Within 1 month', '1-3 months', '3-6 months', 'Just researching']
  },
  contractPreference: {
    type: String,
    enum: ['Lease', 'Rental', 'Purchase', 'Not sure']
  },
  budgetRange: {
    type: String,
    enum: ['Under £200/mo', '£200-400/mo', '£400-800/mo', '£800+/mo', 'Flexible']
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
