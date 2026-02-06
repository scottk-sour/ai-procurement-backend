import express from 'express';
import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Vendor from '../models/Vendor.js';
import { sendReviewNotification, sendReviewResponseNotification } from '../services/emailService.js';

const router = express.Router();

// =====================================================
// PUBLIC ROUTES (no auth required)
// =====================================================

// GET /api/reviews/vendor/:vendorId - Get approved reviews for a vendor
router.get('/vendor/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    // Verify vendor exists
    const vendor = await Vendor.findById(vendorId).select('company');
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Build sort options
    let sortOptions = {};
    switch (sort) {
      case 'highest':
        sortOptions = { rating: -1, createdAt: -1 };
        break;
      case 'lowest':
        sortOptions = { rating: 1, createdAt: -1 };
        break;
      case 'helpful':
        sortOptions = { helpfulVotes: -1, createdAt: -1 };
        break;
      case 'recent':
      default:
        sortOptions = { createdAt: -1 };
    }

    // Fetch approved reviews
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const reviews = await Review.find({ vendor: vendorId, status: 'approved' })
      .select('reviewer.name reviewer.company rating title content service detailedRatings wouldRecommend vendorResponse helpfulVotes createdAt')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get stats
    const stats = await Review.calculateVendorStats(vendorId);
    const totalReviews = stats.totalReviews;

    res.json({
      success: true,
      vendor: { id: vendorId, company: vendor.company },
      reviews,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalReviews,
        pages: Math.ceil(totalReviews / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews', message: error.message });
  }
});

// GET /api/reviews/stats/:vendorId - Get review statistics for a vendor
router.get('/stats/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const stats = await Review.calculateVendorStats(vendorId);

    res.json({
      success: true,
      vendorId,
      stats
    });
  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({ error: 'Failed to fetch review stats', message: error.message });
  }
});

// POST /api/reviews - Submit a new review (public, goes to moderation queue)
router.post('/', async (req, res) => {
  try {
    const {
      vendorId,
      reviewerName,
      reviewerCompany,
      reviewerEmail,
      rating,
      title,
      content,
      service,
      detailedRatings,
      wouldRecommend
    } = req.body;

    // Validate required fields
    if (!vendorId || !reviewerName || !rating || !title || !content) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['vendorId', 'reviewerName', 'rating', 'title', 'content']
      });
    }

    // Validate vendor exists
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findById(vendorId).select('company email name');
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Check for duplicate review (same email, same vendor, within 30 days)
    if (reviewerEmail) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const existingReview = await Review.findOne({
        vendor: vendorId,
        'reviewer.email': reviewerEmail.toLowerCase(),
        createdAt: { $gte: thirtyDaysAgo }
      });

      if (existingReview) {
        return res.status(400).json({
          error: 'Duplicate review',
          message: 'You have already submitted a review for this vendor recently'
        });
      }
    }

    // Create the review
    const review = new Review({
      vendor: vendorId,
      reviewer: {
        name: reviewerName,
        company: reviewerCompany || '',
        email: reviewerEmail ? reviewerEmail.toLowerCase() : '',
        isVerified: false
      },
      rating,
      title,
      content,
      service: service || 'General',
      detailedRatings: detailedRatings || {},
      wouldRecommend: wouldRecommend !== undefined ? wouldRecommend : true,
      status: 'pending',
      source: 'website'
    });

    await review.save();

    // Send notification email to vendor (non-blocking)
    sendReviewNotification(vendor.email, {
      vendorName: vendor.name || vendor.company,
      reviewerName,
      rating,
      title,
      content
    }).catch(err => console.error('Failed to send review notification:', err));

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully and is pending moderation',
      reviewId: review._id
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ error: 'Failed to submit review', message: error.message });
  }
});

// POST /api/reviews/:reviewId/helpful - Mark a review as helpful
router.post('/:reviewId/helpful', async (req, res) => {
  try {
    const { reviewId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ error: 'Invalid review ID' });
    }

    const review = await Review.findOneAndUpdate(
      { _id: reviewId, status: 'approved' },
      { $inc: { helpfulVotes: 1 } },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json({
      success: true,
      helpfulVotes: review.helpfulVotes
    });
  } catch (error) {
    console.error('Error marking review helpful:', error);
    res.status(500).json({ error: 'Failed to mark review as helpful', message: error.message });
  }
});

// =====================================================
// VENDOR ROUTES (require vendor auth)
// =====================================================

// GET /api/reviews/my-reviews - Get reviews for the authenticated vendor
router.get('/my-reviews', async (req, res) => {
  try {
    // Get vendor ID from auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const jwt = await import('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);

    if (!decoded.vendorId) {
      return res.status(403).json({ error: 'Vendor access required' });
    }

    const { page = 1, limit = 20, status } = req.query;

    // Build query
    const query = { vendor: decoded.vendorId };
    if (status && ['pending', 'approved', 'rejected', 'flagged'].includes(status)) {
      query.status = status;
    }

    // Fetch reviews
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const reviews = await Review.find(query)
      .select('reviewer rating title content service status vendorResponse helpfulVotes createdAt moderatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get counts by status
    const statusCounts = await Review.aggregate([
      { $match: { vendor: new mongoose.Types.ObjectId(decoded.vendorId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      flagged: 0,
      total: 0
    };

    statusCounts.forEach(s => {
      counts[s._id] = s.count;
      counts.total += s.count;
    });

    // Get stats
    const stats = await Review.calculateVendorStats(decoded.vendorId);

    res.json({
      success: true,
      reviews,
      stats,
      counts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: counts.total,
        pages: Math.ceil(counts.total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching vendor reviews:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'Failed to fetch reviews', message: error.message });
  }
});

// POST /api/reviews/:reviewId/respond - Vendor responds to a review
router.post('/:reviewId/respond', async (req, res) => {
  try {
    // Get vendor ID from auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const jwt = await import('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);

    if (!decoded.vendorId) {
      return res.status(403).json({ error: 'Vendor access required' });
    }

    const { reviewId } = req.params;
    const { response } = req.body;

    if (!response || response.trim().length === 0) {
      return res.status(400).json({ error: 'Response content is required' });
    }

    if (response.length > 1000) {
      return res.status(400).json({ error: 'Response must be under 1000 characters' });
    }

    // Find review and verify ownership
    const review = await Review.findOne({
      _id: reviewId,
      vendor: decoded.vendorId,
      status: 'approved'
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found or not approved' });
    }

    // Update with vendor response
    review.vendorResponse = {
      content: response.trim(),
      respondedAt: new Date()
    };

    await review.save();

    // Send notification to reviewer if they have an email (non-blocking)
    if (review.reviewer.email) {
      const vendor = await Vendor.findById(decoded.vendorId).select('company');
      sendReviewResponseNotification(review.reviewer.email, {
        reviewerName: review.reviewer.name,
        vendorName: vendor?.company || 'The vendor',
        responseContent: response.trim()
      }).catch(err => console.error('Failed to send response notification:', err));
    }

    res.json({
      success: true,
      message: 'Response added successfully',
      vendorResponse: review.vendorResponse
    });
  } catch (error) {
    console.error('Error responding to review:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'Failed to respond to review', message: error.message });
  }
});

// =====================================================
// ADMIN ROUTES (require admin auth)
// =====================================================

// GET /api/reviews/admin/pending - Get pending reviews for moderation
router.get('/admin/pending', async (req, res) => {
  try {
    // Verify admin auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const jwt = await import('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const reviews = await Review.find({ status: 'pending' })
      .populate('vendor', 'company')
      .select('reviewer rating title content service vendor createdAt')
      .sort({ createdAt: 1 }) // Oldest first for moderation queue
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Review.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching pending reviews:', error);
    res.status(500).json({ error: 'Failed to fetch pending reviews', message: error.message });
  }
});

// POST /api/reviews/admin/:reviewId/moderate - Approve or reject a review
router.post('/admin/:reviewId/moderate', async (req, res) => {
  try {
    // Verify admin auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const jwt = await import('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { reviewId } = req.params;
    const { action, note } = req.body;

    if (!['approve', 'reject', 'flag'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be: approve, reject, or flag' });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Update review status
    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      flag: 'flagged'
    };

    review.status = statusMap[action];
    review.moderatedBy = decoded.userId;
    review.moderatedAt = new Date();
    review.moderationNote = note || '';

    await review.save();

    // If approved, the post-save hook will update vendor rating

    res.json({
      success: true,
      message: `Review ${action}d successfully`,
      review: {
        id: review._id,
        status: review.status,
        moderatedAt: review.moderatedAt
      }
    });
  } catch (error) {
    console.error('Error moderating review:', error);
    res.status(500).json({ error: 'Failed to moderate review', message: error.message });
  }
});

export default router;
