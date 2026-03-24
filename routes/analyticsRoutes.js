// /routes/analyticsRoutes.js
import express from 'express';
import mongoose from 'mongoose';
import logger from '../services/logger.js';
import adminAuth from '../middleware/adminAuth.js';
import vendorAuth from '../middleware/vendorAuth.js';
import ProfileView from '../models/ProfileView.js';
import VendorAnalytics from '../models/VendorAnalytics.js';

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
 * Get AI referral statistics (admin only)
 */
router.get('/ai-referrals', adminAuth, async (req, res) => {
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

/**
 * GET /api/analytics/ai-referrals/me
 * Get AI referral stats for the authenticated vendor
 */
router.get('/ai-referrals/me', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, byPlatform, recent] = await Promise.all([
      AIReferral.countDocuments({ vendorId: new mongoose.Types.ObjectId(vendorId), timestamp: { $gte: thisMonthStart } }),
      AIReferral.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), timestamp: { $gte: thisMonthStart } } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      AIReferral.find({ vendorId: new mongoose.Types.ObjectId(vendorId) })
        .sort({ timestamp: -1 })
        .limit(10)
        .select({ source: 1, timestamp: 1, page: 1, action: 1 })
        .lean(),
    ]);

    const platformMap = { chatgpt: 0, perplexity: 0, gemini: 0, claude: 0, grok: 0, copilot: 0 };
    byPlatform.forEach((p) => {
      if (p._id in platformMap) platformMap[p._id] = p.count;
    });

    res.json({
      success: true,
      total,
      byPlatform: platformMap,
      recent: recent.map((r) => ({
        source: r.source,
        timestamp: r.timestamp,
        page: r.page,
      })),
    });
  } catch (error) {
    logger.error('Failed to get vendor AI referral stats', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

/**
 * POST /api/analytics/profile-view
 * Track a vendor profile page view (public, no auth)
 * Rate limited: 1 view per IP per vendor per hour
 */
router.post('/profile-view', async (req, res) => {
  try {
    const { vendorId, source } = req.body;

    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ success: false, error: 'Invalid vendorId' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Rate limit: 1 view per IP per vendor per hour
    const existing = await ProfileView.findOne({
      vendorId,
      ip,
      timestamp: { $gte: oneHourAgo },
    });

    if (existing) {
      return res.json({ success: true, message: 'Already tracked' });
    }

    await ProfileView.create({
      vendorId,
      source: source || 'unknown',
      userAgent: req.get('User-Agent'),
      ip,
    });

    // Also write to vendor_analytics for the analytics dashboard
    try {
      await VendorAnalytics.create({
        vendorId,
        eventType: 'view',
        source: { referrer: source || 'unknown', page: '/suppliers/vendor' },
        timestamp: new Date(),
      });
    } catch (dualWriteErr) {
      logger.warn('Dual-write to vendor_analytics failed', { error: dualWriteErr.message });
    }

    console.log(`Profile view tracked: vendor=${vendorId}, source=${source || 'unknown'}, ip=${ip}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to track profile view', { error: error.message });
    res.json({ success: true, message: 'Acknowledged' });
  }
});

/**
 * GET /api/analytics/profile-views/me
 * Get profile view stats for the authenticated vendor
 */
router.get('/profile-views/me', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const now = new Date();

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [thisMonth, lastMonth, bySource] = await Promise.all([
      ProfileView.countDocuments({ vendorId, timestamp: { $gte: thisMonthStart } }),
      ProfileView.countDocuments({ vendorId, timestamp: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
      ProfileView.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), timestamp: { $gte: thisMonthStart } } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
    ]);

    const sourceMap = { google: 0, bing: 0, direct: 0, ai_referral: 0, tendorai_search: 0, unknown: 0 };
    bySource.forEach((s) => {
      if (s._id in sourceMap) sourceMap[s._id] = s.count;
    });

    res.json({
      success: true,
      thisMonth,
      lastMonth,
      bySource: sourceMap,
    });
  } catch (error) {
    logger.error('Failed to get profile view stats', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// Ensure default export
export default router;
