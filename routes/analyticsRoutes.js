// /routes/analyticsRoutes.js
import express from 'express';
import mongoose from 'mongoose';
import logger from '../services/logger.js';

const router = express.Router();

// AI Referral tracking schema (embedded in this file for simplicity)
const aiReferralSchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    index: true
  },
  page: String,
  action: {
    type: String,
    enum: ['pageview', 'search', 'view_supplier', 'quote_request'],
    default: 'pageview'
  },
  searchParams: {
    service: String,
    location: String
  },
  userAgent: String,
  ip: String,
  referrer: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Create or get the AIReferral model
let AIReferral;
try {
  AIReferral = mongoose.model('AIReferral');
} catch {
  AIReferral = mongoose.model('AIReferral', aiReferralSchema);
}

// Example analytics POST endpoint
router.post('/', (req, res) => {
  console.log('Analytics Event Logged:', req.body);
  res.status(200).json({ message: 'Analytics logged successfully.' });
});

/**
 * POST /api/analytics/ai-referral
 * Track AI assistant referrals
 */
router.post('/ai-referral', async (req, res) => {
  try {
    const { source, vendorId, page, action, searchParams, timestamp } = req.body;

    const referral = new AIReferral({
      source: source || 'unknown',
      vendorId: vendorId || null,
      page: page || '/',
      action: action || 'pageview',
      searchParams: searchParams || {},
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      referrer: req.get('Referer'),
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    await referral.save();

    logger.info('AI referral tracked', {
      source,
      page,
      action,
      vendorId
    });

    res.json({ success: true, message: 'Referral tracked' });

  } catch (error) {
    logger.error('Failed to track AI referral', { error: error.message });
    // Still return success to not block frontend
    res.json({ success: true, message: 'Referral acknowledged' });
  }
});

/**
 * GET /api/analytics/ai-referrals
 * Get AI referral statistics (admin only - TODO: add auth)
 */
router.get('/ai-referrals', async (req, res) => {
  try {
    const { startDate, endDate, source } = req.query;

    const query = {};

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (source) {
      query.source = source;
    }

    // Get counts by source
    const bySource = await AIReferral.aggregate([
      { $match: query },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get counts by action
    const byAction = await AIReferral.aggregate([
      { $match: query },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get daily counts for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyCounts = await AIReferral.aggregate([
      { $match: { timestamp: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Total count
    const total = await AIReferral.countDocuments(query);

    res.json({
      success: true,
      data: {
        total,
        bySource: bySource.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byAction: byAction.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        dailyTrend: dailyCounts.map(d => ({
          date: d._id,
          count: d.count
        }))
      }
    });

  } catch (error) {
    logger.error('Failed to get AI referral stats', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get statistics' });
  }
});

// Ensure default export
export default router;
