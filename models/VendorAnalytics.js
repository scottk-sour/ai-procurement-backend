// models/VendorAnalytics.js
// Track vendor profile views, clicks, and quote requests

import mongoose from 'mongoose';

const vendorAnalyticsSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },

  // Event type
  eventType: {
    type: String,
    required: true,
    enum: ['view', 'click', 'quote_request', 'contact', 'website_click', 'phone_click', 'ai_mention', 'search_impression'],
    index: true
  },

  // Session/visitor tracking (anonymous)
  sessionId: {
    type: String,
    index: true
  },

  // Source information
  source: {
    page: String,           // e.g., '/suppliers/cctv/london'
    referrer: String,       // e.g., 'google', 'direct', 'facebook'
    campaign: String,       // UTM campaign if any
    searchQuery: String,    // What user searched for
    category: String,       // Service category context
    location: String        // Location context
  },

  // Device/browser info (anonymous)
  device: {
    type: {
      type: String,         // 'mobile', 'tablet', 'desktop'
      enum: ['mobile', 'tablet', 'desktop', 'unknown']
    },
    browser: String,
    os: String
  },

  // Geographic info (from IP, anonymized to city level)
  geo: {
    city: String,
    region: String,
    country: String,
    postcode: String        // Outcode only (e.g., 'SW1' not 'SW1A 1AA')
  },

  // Additional metadata
  metadata: {
    quoteRequestId: mongoose.Schema.Types.ObjectId,  // If eventType is quote_request
    productId: mongoose.Schema.Types.ObjectId,       // If specific product
    value: Number                                    // For conversion tracking
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'vendor_analytics'
});

// Compound indexes for efficient querying
vendorAnalyticsSchema.index({ vendorId: 1, eventType: 1, timestamp: -1 });
vendorAnalyticsSchema.index({ vendorId: 1, timestamp: -1 });
vendorAnalyticsSchema.index({ timestamp: -1, eventType: 1 });

// Static methods for aggregations

/**
 * Get vendor stats summary
 */
vendorAnalyticsSchema.statics.getVendorStats = async function(vendorId, startDate, endDate) {
  const match = {
    vendorId: new mongoose.Types.ObjectId(vendorId)
  };

  if (startDate || endDate) {
    match.timestamp = {};
    if (startDate) match.timestamp.$gte = new Date(startDate);
    if (endDate) match.timestamp.$lte = new Date(endDate);
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        uniqueSessions: { $addToSet: '$sessionId' }
      }
    },
    {
      $project: {
        eventType: '$_id',
        count: 1,
        uniqueCount: { $size: '$uniqueSessions' }
      }
    }
  ]);

  // Transform to object
  const result = {
    views: 0,
    uniqueViews: 0,
    clicks: 0,
    quoteRequests: 0,
    contacts: 0,
    websiteClicks: 0,
    phoneClicks: 0,
    aiMentions: 0,
    searchImpressions: 0
  };

  stats.forEach(stat => {
    switch (stat.eventType) {
      case 'view':
        result.views = stat.count;
        result.uniqueViews = stat.uniqueCount;
        break;
      case 'click':
        result.clicks = stat.count;
        break;
      case 'quote_request':
        result.quoteRequests = stat.count;
        break;
      case 'contact':
        result.contacts = stat.count;
        break;
      case 'website_click':
        result.websiteClicks = stat.count;
        break;
      case 'phone_click':
        result.phoneClicks = stat.count;
        break;
      case 'ai_mention':
        result.aiMentions = stat.count;
        break;
      case 'search_impression':
        result.searchImpressions = stat.count;
        break;
    }
  });

  // Calculate conversion rate
  result.conversionRate = result.views > 0
    ? ((result.quoteRequests / result.views) * 100).toFixed(2) + '%'
    : '0%';

  return result;
};

/**
 * Get daily stats for a vendor
 */
vendorAnalyticsSchema.statics.getDailyStats = async function(vendorId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        vendorId: new mongoose.Types.ObjectId(vendorId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          eventType: '$eventType'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        events: {
          $push: {
            type: '$_id.eventType',
            count: '$count'
          }
        }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        date: '$_id',
        events: 1,
        _id: 0
      }
    }
  ]);
};

/**
 * Get top sources for a vendor
 */
vendorAnalyticsSchema.statics.getTopSources = async function(vendorId, limit = 10) {
  return this.aggregate([
    {
      $match: {
        vendorId: new mongoose.Types.ObjectId(vendorId),
        'source.referrer': { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$source.referrer',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $project: {
        source: '$_id',
        count: 1,
        _id: 0
      }
    }
  ]);
};

/**
 * Get geographic distribution
 */
vendorAnalyticsSchema.statics.getGeoDistribution = async function(vendorId) {
  return this.aggregate([
    {
      $match: {
        vendorId: new mongoose.Types.ObjectId(vendorId),
        'geo.region': { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$geo.region',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 20 },
    {
      $project: {
        region: '$_id',
        count: 1,
        _id: 0
      }
    }
  ]);
};

const VendorAnalytics = mongoose.model('VendorAnalytics', vendorAnalyticsSchema);

export default VendorAnalytics;
