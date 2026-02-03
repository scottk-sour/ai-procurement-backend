// routes/vendorAnalyticsRoutes.js
// Analytics tracking and reporting endpoints

import express from 'express';
import VendorAnalytics from '../models/VendorAnalytics.js';
import vendorAuth from '../middleware/vendorAuth.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * POST /api/analytics/track
 * Track a vendor analytics event (public, no auth required)
 */
router.post('/track', async (req, res) => {
  try {
    const {
      vendorId,
      eventType,
      sessionId,
      source,
      metadata
    } = req.body;

    // Validate required fields
    if (!vendorId || !eventType) {
      return res.status(400).json({
        success: false,
        message: 'vendorId and eventType are required'
      });
    }

    // Validate eventType
    const validEventTypes = ['view', 'click', 'quote_request', 'contact', 'website_click', 'phone_click', 'ai_mention', 'search_impression'];
    if (!validEventTypes.includes(eventType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}`
      });
    }

    // Extract device info from user agent
    const userAgent = req.headers['user-agent'] || '';
    const device = parseUserAgent(userAgent);

    // Extract geo from headers (if using proxy like Cloudflare) or leave empty
    const geo = {
      city: req.headers['cf-ipcity'] || req.headers['x-vercel-ip-city'] || null,
      region: req.headers['cf-region'] || req.headers['x-vercel-ip-country-region'] || null,
      country: req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || null
    };

    // Create analytics event
    const analyticsEvent = new VendorAnalytics({
      vendorId,
      eventType,
      sessionId: sessionId || generateSessionId(),
      source: {
        page: source?.page || req.headers.referer,
        referrer: source?.referrer || parseReferrer(req.headers.referer),
        campaign: source?.campaign,
        searchQuery: source?.searchQuery,
        category: source?.category,
        location: source?.location
      },
      device,
      geo,
      metadata: {
        quoteRequestId: metadata?.quoteRequestId,
        productId: metadata?.productId,
        value: metadata?.value
      }
    });

    await analyticsEvent.save();

    res.status(201).json({
      success: true,
      message: 'Event tracked successfully',
      sessionId: analyticsEvent.sessionId
    });

  } catch (error) {
    console.error('Analytics tracking error:', error);
    // Don't fail silently but also don't expose internal errors
    res.status(500).json({
      success: false,
      message: 'Failed to track event'
    });
  }
});

/**
 * POST /api/analytics/batch
 * Track multiple events at once (for batched client-side tracking)
 */
router.post('/batch', async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'events array is required'
      });
    }

    // Limit batch size
    if (events.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 50 events per batch'
      });
    }

    const validEventTypes = ['view', 'click', 'quote_request', 'contact', 'website_click', 'phone_click', 'ai_mention', 'search_impression'];
    const userAgent = req.headers['user-agent'] || '';
    const device = parseUserAgent(userAgent);

    const analyticsEvents = events
      .filter(e => e.vendorId && e.eventType && validEventTypes.includes(e.eventType))
      .map(event => ({
        vendorId: event.vendorId,
        eventType: event.eventType,
        sessionId: event.sessionId || generateSessionId(),
        source: {
          page: event.source?.page,
          referrer: event.source?.referrer,
          category: event.source?.category,
          location: event.source?.location
        },
        device,
        metadata: event.metadata,
        timestamp: event.timestamp ? new Date(event.timestamp) : new Date()
      }));

    if (analyticsEvents.length > 0) {
      await VendorAnalytics.insertMany(analyticsEvents);
    }

    res.status(201).json({
      success: true,
      message: `${analyticsEvents.length} events tracked`,
      processed: analyticsEvents.length,
      skipped: events.length - analyticsEvents.length
    });

  } catch (error) {
    console.error('Batch analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track events'
    });
  }
});

/**
 * GET /api/analytics/stats
 * Get vendor analytics summary (requires vendor auth)
 */
router.get('/stats', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { startDate, endDate } = req.query;

    const stats = await VendorAnalytics.getVendorStats(vendorId, startDate, endDate);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Analytics stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats'
    });
  }
});

/**
 * GET /api/analytics/daily
 * Get daily analytics breakdown (requires vendor auth)
 */
router.get('/daily', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { days = 30 } = req.query;

    const dailyStats = await VendorAnalytics.getDailyStats(vendorId, parseInt(days));

    res.json({
      success: true,
      data: {
        days: parseInt(days),
        stats: dailyStats
      }
    });

  } catch (error) {
    console.error('Daily analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily stats'
    });
  }
});

/**
 * GET /api/analytics/sources
 * Get top traffic sources (requires vendor auth)
 */
router.get('/sources', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { limit = 10 } = req.query;

    const sources = await VendorAnalytics.getTopSources(vendorId, parseInt(limit));

    res.json({
      success: true,
      data: sources
    });

  } catch (error) {
    console.error('Analytics sources error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sources'
    });
  }
});

/**
 * GET /api/analytics/geo
 * Get geographic distribution (requires vendor auth)
 */
router.get('/geo', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    const geoData = await VendorAnalytics.getGeoDistribution(vendorId);

    res.json({
      success: true,
      data: geoData
    });

  } catch (error) {
    console.error('Analytics geo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch geo data'
    });
  }
});

/**
 * GET /api/analytics/vendor/:vendorId
 * Get comprehensive analytics for a specific vendor (public endpoint for dashboard)
 * Returns profile views, quote requests, AI mentions with source breakdown
 */
router.get('/vendor/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { period = '7d' } = req.query;

    // Validate vendorId
    const mongoose = await import('mongoose');
    if (!mongoose.default.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendorId' });
    }

    const days = period === '30d' ? 30 : 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const oid = new mongoose.default.Types.ObjectId(vendorId);

    // Get event counts by type
    const eventCounts = await VendorAnalytics.aggregate([
      { $match: { vendorId: oid, timestamp: { $gte: startDate } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } }
    ]);

    const counts = {};
    eventCounts.forEach(c => { counts[c._id] = c.count; });

    // Get AI mentions by source
    const aiBySource = await VendorAnalytics.aggregate([
      { $match: { vendorId: oid, eventType: 'ai_mention', timestamp: { $gte: startDate } } },
      { $group: { _id: '$source.referrer', count: { $sum: 1 } } }
    ]);

    // Get daily activity
    const dailyActivity = await VendorAnalytics.aggregate([
      { $match: { vendorId: oid, timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          profileViews: { $sum: { $cond: [{ $eq: ['$eventType', 'view'] }, 1, 0] } },
          aiMentions: { $sum: { $cond: [{ $eq: ['$eventType', 'ai_mention'] }, 1, 0] } },
          quoteRequests: { $sum: { $cond: [{ $eq: ['$eventType', 'quote_request'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get recent AI queries
    const recentAiQueries = await VendorAnalytics.find({
      vendorId: oid,
      eventType: 'ai_mention'
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('timestamp source.searchQuery source.referrer metadata.position')
      .lean();

    res.json({
      period: `${days}d`,
      profileViews: counts.view || 0,
      quoteRequests: counts.quote_request || 0,
      websiteClicks: counts.website_click || 0,
      phoneClicks: counts.phone_click || 0,
      aiMentions: counts.ai_mention || 0,
      searchImpressions: counts.search_impression || 0,
      aiMentionsBySource: {
        chatgpt: aiBySource.find(a => a._id === 'chatgpt')?.count || 0,
        claude: aiBySource.find(a => a._id === 'claude')?.count || 0,
        perplexity: aiBySource.find(a => a._id === 'perplexity')?.count || 0,
        other: aiBySource.filter(a => !['chatgpt', 'claude', 'perplexity'].includes(a._id)).reduce((s, a) => s + a.count, 0)
      },
      recentAiQueries: recentAiQueries.map(q => ({
        timestamp: q.timestamp,
        query: q.source?.searchQuery,
        position: q.metadata?.position,
        source: q.source?.referrer
      })),
      dailyActivity: dailyActivity.map(d => ({
        date: d._id,
        profileViews: d.profileViews,
        aiMentions: d.aiMentions,
        quoteRequests: d.quoteRequests
      }))
    });

  } catch (error) {
    console.error('Vendor analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor analytics' });
  }
});

// Helper functions

function generateSessionId() {
  // Use crypto for UUID generation (Node.js built-in)
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function parseUserAgent(userAgent) {
  const ua = userAgent.toLowerCase();

  let deviceType = 'desktop';
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) {
    deviceType = 'mobile';
  } else if (/ipad|tablet/i.test(ua)) {
    deviceType = 'tablet';
  }

  let browser = 'unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'chrome';
  else if (ua.includes('firefox')) browser = 'firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'safari';
  else if (ua.includes('edg')) browser = 'edge';
  else if (ua.includes('msie') || ua.includes('trident')) browser = 'ie';

  let os = 'unknown';
  if (ua.includes('windows')) os = 'windows';
  else if (ua.includes('mac os')) os = 'macos';
  else if (ua.includes('linux')) os = 'linux';
  else if (ua.includes('android')) os = 'android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'ios';

  return { type: deviceType, browser, os };
}

function parseReferrer(referer) {
  if (!referer) return 'direct';

  try {
    const url = new URL(referer);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes('google')) return 'google';
    if (hostname.includes('bing')) return 'bing';
    if (hostname.includes('yahoo')) return 'yahoo';
    if (hostname.includes('facebook')) return 'facebook';
    if (hostname.includes('linkedin')) return 'linkedin';
    if (hostname.includes('twitter') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('tendorai')) return 'internal';

    return hostname;
  } catch {
    return 'unknown';
  }
}

export default router;
