import express from 'express';
import axios from 'axios';
import vendorAuth from '../middleware/vendorAuth.js';
import AeoAudit from '../models/AeoAudit.js';
import Vendor from '../models/Vendor.js';
import {
  detectBlog,
  analyseAeoSignals,
  BLOG_DETECTION_DEFAULT,
} from '../services/aeoDetector.js';

const router = express.Router();

/** Paid tier names (Starter + Pro and all aliases) */
const PAID_TIERS = ['basic', 'starter', 'silver', 'visible', 'managed', 'pro', 'verified', 'gold', 'enterprise'];

/**
 * POST /api/aeo-audit
 * Run an AEO audit on the vendor's website
 */
router.post('/', vendorAuth, async (req, res) => {
  try {
    let { websiteUrl } = req.body;
    if (!websiteUrl || typeof websiteUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'websiteUrl is required' });
    }

    websiteUrl = websiteUrl.trim();
    if (!/^https?:\/\//i.test(websiteUrl)) {
      websiteUrl = 'https://' + websiteUrl;
    }

    try {
      new URL(websiteUrl);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    // Rate limit check
    const vendor = await Vendor.findById(req.vendor.id).lean();
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const vendorTier = vendor.tier || vendor.account?.tier || 'free';
    const isPaid = PAID_TIERS.includes(vendorTier.toLowerCase());

    if (isPaid) {
      // Paid: 1 audit per 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recent = await AeoAudit.findOne({
        vendorId: req.vendor.id,
        createdAt: { $gte: sevenDaysAgo },
      }).lean();

      if (recent) {
        const nextAvailable = new Date(recent.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        return res.status(429).json({
          success: false,
          limited: true,
          message: 'You can run one AI Visibility (AEO) audit per week.',
          nextAvailable: nextAvailable.toISOString(),
        });
      }
    } else {
      // Free: 1 audit ever
      const existing = await AeoAudit.findOne({ vendorId: req.vendor.id }).lean();
      if (existing) {
        return res.status(429).json({
          success: false,
          limited: true,
          message: 'Free accounts can run one AI Visibility (AEO) audit. Upgrade to run weekly audits.',
          upgradeUrl: '/vendor-dashboard/settings?tab=subscription',
        });
      }
    }

    // Fetch the page
    let html;
    try {
      const response = await axios.get(websiteUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'TendorAI-AEO-Audit/1.0',
          'Accept': 'text/html',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });
      html = response.data;
    } catch (fetchError) {
      const msg = fetchError.code === 'ECONNABORTED'
        ? 'Website took too long to respond (15s timeout).'
        : fetchError.response
          ? `Website returned HTTP ${fetchError.response.status}.`
          : 'Could not reach the website. Check the URL and try again.';
      return res.status(422).json({ success: false, error: msg });
    }

    if (typeof html !== 'string') {
      return res.status(422).json({ success: false, error: 'Website did not return HTML content.' });
    }

    // Detect blog presence: HTML scan -> path probes -> sitemap
    const origin = new URL(websiteUrl).origin;
    const blogDetection = await detectBlog(origin, html);

    // Run analysis
    const { overallScore, checks, recommendations, tendoraiSchemaDetected } = analyseAeoSignals(html, websiteUrl);

    // Save audit
    const audit = await AeoAudit.create({
      vendorId: req.vendor.id,
      websiteUrl,
      overallScore,
      checks,
      recommendations,
      tendoraiSchemaDetected,
      blogDetection,
    });

    res.json({
      success: true,
      data: {
        id: audit._id,
        websiteUrl: audit.websiteUrl,
        overallScore: audit.overallScore,
        checks: audit.checks,
        recommendations: audit.recommendations,
        tendoraiSchemaDetected: audit.tendoraiSchemaDetected,
        blogDetection: audit.blogDetection,
        createdAt: audit.createdAt,
      },
    });
  } catch (error) {
    console.error('AEO Audit error:', error);
    res.status(500).json({ success: false, error: 'Failed to run AI Visibility (AEO) audit.' });
  }
});

/**
 * GET /api/aeo-audit/latest
 * Fetch the most recent audit for the vendor, plus a canRunAgain flag
 */
router.get('/latest', vendorAuth, async (req, res) => {
  try {
    const audit = await AeoAudit.findOne({ vendorId: req.vendor.id })
      .sort({ createdAt: -1 })
      .lean();

    if (!audit) {
      return res.json({ success: true, data: null, canRunAgain: true });
    }

    // Determine if vendor can run again
    const vendor = await Vendor.findById(req.vendor.id).select('tier account').lean();
    const vendorTier = vendor?.tier || vendor?.account?.tier || 'free';
    const isPaid = PAID_TIERS.includes(vendorTier.toLowerCase());

    let canRunAgain = false;
    let nextAvailable = null;

    if (isPaid) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      canRunAgain = new Date(audit.createdAt) < sevenDaysAgo;
      if (!canRunAgain) {
        nextAvailable = new Date(new Date(audit.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
    } else {
      canRunAgain = false; // free tier already used their one audit
    }

    res.json({
      success: true,
      data: {
        id: audit._id,
        websiteUrl: audit.websiteUrl,
        overallScore: audit.overallScore,
        checks: audit.checks,
        recommendations: audit.recommendations,
        tendoraiSchemaDetected: audit.tendoraiSchemaDetected || false,
        blogDetection: audit.blogDetection || { ...BLOG_DETECTION_DEFAULT },
        createdAt: audit.createdAt,
      },
      canRunAgain,
      nextAvailable,
      tier: vendorTier,
    });
  } catch (error) {
    console.error('AEO Audit latest error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch latest audit.' });
  }
});

/**
 * GET /api/aeo-audit/history
 * Last 10 audits (id, url, score, date)
 */
router.get('/history', vendorAuth, async (req, res) => {
  try {
    const audits = await AeoAudit.find({ vendorId: req.vendor.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('websiteUrl overallScore createdAt')
      .lean();

    res.json({
      success: true,
      data: audits.map(a => ({
        id: a._id,
        websiteUrl: a.websiteUrl,
        overallScore: a.overallScore,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error('AEO Audit history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit history.' });
  }
});

export default router;
