import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  // Which vendor is being reviewed
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },

  // Who submitted the review (can be anonymous)
  reviewer: {
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    isVerified: { type: Boolean, default: false }
  },

  // Rating (1-5 stars)
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },

  // Review content
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },

  // Which service was reviewed
  service: {
    type: String,
    enum: ['Photocopiers', 'CCTV', 'IT', 'Telecoms', 'Security', 'Software', 'General'],
    default: 'General'
  },

  // Detailed ratings (optional)
  detailedRatings: {
    serviceQuality: { type: Number, min: 1, max: 5 },
    valueForMoney: { type: Number, min: 1, max: 5 },
    communication: { type: Number, min: 1, max: 5 },
    reliability: { type: Number, min: 1, max: 5 },
    expertise: { type: Number, min: 1, max: 5 }
  },

  // Would recommend?
  wouldRecommend: {
    type: Boolean,
    default: true
  },

  // Moderation
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'pending',
    index: true
  },

  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  moderatedAt: Date,

  moderationNote: String,

  // Vendor response
  vendorResponse: {
    content: { type: String, trim: true, maxlength: 1000 },
    respondedAt: Date
  },

  // Helpful votes
  helpfulVotes: {
    type: Number,
    default: 0
  },

  // Source tracking
  source: {
    type: String,
    enum: ['website', 'email-request', 'api', 'imported'],
    default: 'website'
  },

  // For linking to a quote/transaction if applicable
  quoteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quote'
  },

  // Verified review fields (tied to VendorLead quote requests)
  quoteRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorLead',
    index: true
  },
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  reviewToken: {
    type: String
  }

}, {
  timestamps: true
});

// Index for efficient queries
reviewSchema.index({ vendor: 1, status: 1 });
reviewSchema.index({ vendor: 1, createdAt: -1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ 'reviewer.email': 1 });

// Static method to calculate vendor rating stats
reviewSchema.statics.calculateVendorStats = async function(vendorId) {
  const stats = await this.aggregate([
    { $match: { vendor: new mongoose.Types.ObjectId(vendorId), status: 'approved' } },
    {
      $group: {
        _id: '$vendor',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        fiveStars: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        fourStars: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        threeStars: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        twoStars: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        recommendPercentage: {
          $avg: { $cond: ['$wouldRecommend', 100, 0] }
        }
      }
    }
  ]);

  if (stats.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      recommendPercentage: 0
    };
  }

  const s = stats[0];
  return {
    averageRating: Math.round(s.averageRating * 10) / 10,
    totalReviews: s.totalReviews,
    distribution: {
      5: s.fiveStars,
      4: s.fourStars,
      3: s.threeStars,
      2: s.twoStars,
      1: s.oneStar
    },
    recommendPercentage: Math.round(s.recommendPercentage)
  };
};

// Post-save hook to update vendor's rating
reviewSchema.post('save', async function() {
  if (this.status === 'approved') {
    try {
      const Vendor = mongoose.model('Vendor');
      const stats = await this.constructor.calculateVendorStats(this.vendor);

      await Vendor.findByIdAndUpdate(this.vendor, {
        'performance.rating': stats.averageRating,
        'performance.reviewCount': stats.totalReviews
      });
    } catch (error) {
      console.error('Error updating vendor rating:', error);
    }
  }
});

const Review = mongoose.model('Review', reviewSchema);
export default Review;
