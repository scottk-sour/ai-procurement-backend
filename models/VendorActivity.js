// models/VendorActivity.js - Enhanced version
import mongoose from 'mongoose';

const VendorActivitySchema = new mongoose.Schema({
  // Core References
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },

  // Activity Classification
  category: {
    type: String,
    enum: [
      'authentication',  // login, logout, password changes
      'profile',        // profile updates, verification
      'products',       // product uploads, updates, deletions
      'quotes',         // quote generation, responses, updates
      'engagement',     // viewing requests, responding to inquiries
      'system',         // automated activities, API calls
      'commercial',     // payment updates, contract changes
      'support'         // help requests, communications
    ],
    required: true,
    index: true
  },

  type: {
    type: String,
    enum: [
      // Authentication
      'signup', 'login', 'logout', 'password_change', 'password_reset',
      'email_verification', 'account_activation',
      
      // Profile Management
      'profile_update', 'contact_update', 'service_update', 'verification_request',
      'certification_upload', 'business_profile_update',
      
      // Product Management
      'product_upload', 'product_update', 'product_delete', 'bulk_upload',
      'catalog_sync', 'pricing_update', 'inventory_update',
      
      // Quote Management
      'quote_generated', 'quote_sent', 'quote_viewed', 'quote_updated',
      'quote_accepted', 'quote_rejected', 'quote_expired',
      
      // Business Engagement
      'request_viewed', 'request_responded', 'demo_scheduled', 'call_scheduled',
      'follow_up_sent', 'customer_contacted',
      
      // System Activities
      'api_call', 'webhook_received', 'data_export', 'report_generated',
      'integration_update', 'auto_sync',
      
      // Commercial
      'payment_received', 'invoice_sent', 'contract_signed', 'tier_upgraded',
      'subscription_renewed', 'credit_check',
      
      // Support & Communication
      'support_ticket', 'help_accessed', 'training_completed', 'feedback_submitted'
    ],
    required: true,
    index: true
  },

  // Activity Details
  description: {
    type: String,
    required: true,
    maxlength: 500
  },

  // Contextual Data
  metadata: {
    // Related entities
    relatedQuote: { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' },
    relatedProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProduct' },
    relatedRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'QuoteRequest' },
    relatedCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Technical details
    ipAddress: { type: String },
    userAgent: { type: String },
    sessionId: { type: String },
    deviceType: { type: String, enum: ['desktop', 'mobile', 'tablet', 'api'] },
    
    // Business metrics
    valueImpact: { type: Number }, // Potential or actual £ value
    timeSpent: { type: Number }, // Minutes spent on activity
    filesAffected: { type: Number }, // Number of files/products
    customersAffected: { type: Number }, // Number of customers impacted
    
    // Location data
    location: {
      country: { type: String },
      region: { type: String },
      city: { type: String }
    },
    
    // Additional context
    source: { 
      type: String, 
      enum: ['web', 'mobile', 'api', 'email', 'phone', 'admin'],
      default: 'web'
    },
    trigger: {
      type: String,
      enum: ['manual', 'automatic', 'scheduled', 'webhook', 'system'],
      default: 'manual'
    }
  },

  // Performance Tracking
  performance: {
    responseTime: { type: Number }, // Milliseconds for system operations
    success: { type: Boolean, default: true }, // Was the activity successful?
    errorCode: { type: String }, // Error identifier if failed
    retryCount: { type: Number, default: 0 }, // Number of retries
    qualityScore: { type: Number, min: 0, max: 1 } // Quality of the activity (0-1)
  },

  // Impact Assessment
  impact: {
    level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    scope: {
      type: String,
      enum: ['internal', 'customer', 'platform', 'financial'],
      default: 'internal'
    },
    outcome: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
      default: 'neutral'
    }
  },

  // Timestamps
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  completedAt: { type: Date },
  
  // Flags
  flags: {
    isAutomated: { type: Boolean, default: false },
    requiresFollowUp: { type: Boolean, default: false },
    isHighValue: { type: Boolean, default: false },
    isSuspicious: { type: Boolean, default: false },
    isFirstTime: { type: Boolean, default: false }
  }

}, { 
  timestamps: true,
  // Expire old activities after 2 years
  expireAfterSeconds: 2 * 365 * 24 * 60 * 60
});

// Indexes for efficient querying
VendorActivitySchema.index({ vendorId: 1, date: -1 });
VendorActivitySchema.index({ category: 1, type: 1 });
VendorActivitySchema.index({ date: -1 });
VendorActivitySchema.index({ 'metadata.relatedQuote': 1 });
VendorActivitySchema.index({ 'performance.success': 1 });
VendorActivitySchema.index({ 'impact.level': 1, date: -1 });

// Static methods for common queries
VendorActivitySchema.statics.getVendorActivity = function(vendorId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    vendorId,
    date: { $gte: startDate }
  }).sort({ date: -1 });
};

VendorActivitySchema.statics.getActivityByType = function(vendorId, type, limit = 50) {
  return this.find({ vendorId, type })
    .sort({ date: -1 })
    .limit(limit);
};

VendorActivitySchema.statics.getEngagementMetrics = function(vendorId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { $match: { vendorId: mongoose.Types.ObjectId(vendorId), date: { $gte: startDate } } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$performance.responseTime' },
        successRate: { $avg: { $cond: ['$performance.success', 1, 0] } },
        totalValue: { $sum: '$metadata.valueImpact' }
      }
    }
  ]);
};

VendorActivitySchema.statics.createActivity = function(data) {
  // Helper method to create standardized activities
  const activity = new this({
    vendorId: data.vendorId,
    category: data.category,
    type: data.type,
    description: data.description,
    metadata: data.metadata || {},
    performance: data.performance || {},
    impact: data.impact || {},
    flags: data.flags || {}
  });
  
  return activity.save();
};

// Instance methods
VendorActivitySchema.methods.markAsComplete = function(outcome = 'positive') {
  this.completedAt = new Date();
  this.impact.outcome = outcome;
  return this.save();
};

VendorActivitySchema.methods.flagForFollowUp = function(reason) {
  this.flags.requiresFollowUp = true;
  this.metadata.followUpReason = reason;
  return this.save();
};

// Pre-save middleware for auto-calculations
VendorActivitySchema.pre('save', function(next) {
  // Auto-set category based on type if not provided
  if (!this.category) {
    const typeToCategory = {
      'login': 'authentication',
      'logout': 'authentication',
      'signup': 'authentication',
      'product_upload': 'products',
      'quote_generated': 'quotes',
      'profile_update': 'profile'
    };
    this.category = typeToCategory[this.type] || 'system';
  }
  
  // Auto-flag high-value activities
  if (this.metadata.valueImpact && this.metadata.valueImpact > 10000) {
    this.flags.isHighValue = true;
    this.impact.level = 'high';
  }
  
  // Auto-flag suspicious patterns (multiple failed logins, etc.)
  if (this.type === 'login' && !this.performance.success) {
    this.flags.isSuspicious = true;
  }
  
  next();
});

const VendorActivity = mongoose.model('VendorActivity', VendorActivitySchema);
export default VendorActivity;
