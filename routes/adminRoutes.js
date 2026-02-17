// routes/adminRoutes.js
// TendorAI Admin Dashboard API

import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Lead from '../models/Lead.js';
import VendorProduct from '../models/VendorProduct.js';
import Subscriber from '../models/Subscriber.js';
import AeoReport from '../models/AeoReport.js';
import VendorLead from '../models/VendorLead.js';
import Review from '../models/Review.js';
import VendorPost from '../models/VendorPost.js';
import GeoAudit from '../models/GeoAudit.js';
import AIMentionScan from '../models/AIMentionScan.js';
import Stripe from 'stripe';
import { sendEmail, sendVendorWelcomeEmail } from '../services/emailService.js';
import { generateFullReport } from '../services/aeoReportGenerator.js';
import { generateReportPdf } from '../services/aeoReportPdf.js';
import 'dotenv/config';

// Initialize Stripe (same pattern as stripeRoutes.js)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });
}

const router = express.Router();

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_JWT_SECRET } = process.env;

// Middleware for admin authentication
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Not authorized.' });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// Admin Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
    }

    console.log('[Admin Login] Env check:', {
      hasEmail: !!ADMIN_EMAIL,
      hasPassword: !!ADMIN_PASSWORD,
      hasSecret: !!ADMIN_JWT_SECRET,
      secretLength: ADMIN_JWT_SECRET?.length,
    });

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '8h' });
      return res.status(200).json({ status: 'success', token, message: 'Login successful.' });
    } else {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
    }
  } catch (error) {
    console.error('[Admin Login] Error:', error.message, error.stack);
    return res.status(500).json({ status: 'error', message: 'Login failed: ' + error.message });
  }
});

// Dashboard overview stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalUsers, totalVendors, totalQuotes, totalLeads, totalProducts] = await Promise.all([
      User.countDocuments(),
      Vendor.countDocuments(),
      QuoteRequest.countDocuments(),
      Lead.countDocuments(),
      VendorProduct.countDocuments()
    ]);

    // Vendor tier breakdown
    const vendorsByTier = await Vendor.aggregate([
      { $group: { _id: '$tier', count: { $sum: 1 } } }
    ]);

    const tierBreakdown = {
      free: 0,
      visible: 0,
      verified: 0,
      basic: 0,
      managed: 0,
      enterprise: 0
    };
    vendorsByTier.forEach(t => {
      if (t._id) tierBreakdown[t._id] = t.count;
    });

    // Revenue & subscription data — use Stripe if available, else estimate from tiers
    let monthlyRevenue, activeSubscriptions, pastDueSubscriptions = 0, revenueSource;

    if (stripe) {
      try {
        // Fetch all active subscriptions with price data
        const activeSubs = [];
        let hasMore = true;
        let startingAfter;
        while (hasMore) {
          const params = { status: 'active', limit: 100, expand: ['data.items.data.price'] };
          if (startingAfter) params.starting_after = startingAfter;
          const batch = await stripe.subscriptions.list(params);
          activeSubs.push(...batch.data);
          hasMore = batch.has_more;
          if (hasMore) startingAfter = batch.data[batch.data.length - 1].id;
        }

        // Sum MRR from subscription line items (unit_amount is in pence)
        monthlyRevenue = activeSubs.reduce((sum, sub) => {
          const price = sub.items.data[0]?.price;
          if (!price) return sum;
          return sum + (price.unit_amount / 100);
        }, 0);
        activeSubscriptions = activeSubs.length;

        // Count past-due subscriptions
        const pastDueSubs = await stripe.subscriptions.list({ status: 'past_due', limit: 100 });
        pastDueSubscriptions = pastDueSubs.data.length;

        revenueSource = 'stripe';
      } catch (stripeErr) {
        console.error('Stripe API error, falling back to tier estimate:', stripeErr.message);
        // Fall through to tier-based estimate
        stripe = null; // prevent repeated failures this request
      }
    }

    if (!revenueSource) {
      // Fallback: estimate from vendor tiers
      activeSubscriptions = await Vendor.countDocuments({
        tier: { $in: ['visible', 'verified', 'basic', 'managed', 'enterprise'] }
      });
      const visibleCount = tierBreakdown.visible + tierBreakdown.basic;
      const verifiedCount = tierBreakdown.verified + tierBreakdown.managed + tierBreakdown.enterprise;
      monthlyRevenue = (visibleCount * 99) + (verifiedCount * 149);
      pastDueSubscriptions = 0;
      revenueSource = 'estimated';
    }

    // Pending claims (vendors with placeholder emails)
    const pendingClaims = await Vendor.countDocuments({
      email: { $regex: /^unclaimed-/i }
    });

    // Users by role
    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    const roleBreakdown = { user: 0, admin: 0, vendor: 0 };
    usersByRole.forEach(r => {
      if (r._id) roleBreakdown[r._id] = r.count;
    });

    // Recent signups (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentVendors = await Vendor.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalVendors,
        totalQuotes,
        totalLeads,
        totalProducts,
        activeSubscriptions,
        monthlyRevenue,
        pastDueSubscriptions,
        revenueSource,
        pendingClaims,
        recentVendors,
        tierBreakdown,
        roleBreakdown
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching stats.' });
  }
});

// Get total users
router.get('/total-users', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.status(200).json({ status: 'success', totalUsers });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error fetching total users.' });
  }
});

// Get total vendors
router.get('/total-vendors', adminAuth, async (req, res) => {
  try {
    const totalVendors = await Vendor.countDocuments();
    res.status(200).json({ status: 'success', totalVendors });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error fetching total vendors.' });
  }
});

// Get total quotes
router.get('/total-quotes', adminAuth, async (req, res) => {
  try {
    const totalQuotes = await QuoteRequest.countDocuments();
    res.status(200).json({ status: 'success', totalQuotes });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error fetching total quotes.' });
  }
});

// Get all users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find({}, 'name email company createdAt lastLogin role')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching users.' });
  }
});

// Get all vendors with detailed info
router.get('/vendors', adminAuth, async (req, res) => {
  try {
    const vendors = await Vendor.find({})
      .select('company name email services tier account subscriptionStatus stripeCustomerId stripeSubscriptionId createdAt location performance postcodeAreas listingStatus claimedBy claimedAt status')
      .sort({ createdAt: -1 })
      .lean();

    // Get product counts for each vendor
    const vendorIds = vendors.map(v => v._id);
    const productCounts = await VendorProduct.aggregate([
      { $match: { vendorId: { $in: vendorIds } } },
      { $group: { _id: '$vendorId', count: { $sum: 1 } } }
    ]);

    const productCountMap = {};
    productCounts.forEach(p => {
      productCountMap[p._id.toString()] = p.count;
    });

    const vendorsWithDetails = vendors.map(v => ({
      id: v._id,
      company: v.company || 'N/A',
      name: v.name || 'N/A',
      email: v.email,
      services: v.services || [],
      tier: v.tier || v.account?.tier || 'free',
      status: v.status || v.account?.status || 'pending',
      subscriptionStatus: v.subscriptionStatus || 'none',
      hasStripe: !!v.stripeCustomerId,
      productCount: productCountMap[v._id.toString()] || 0,
      city: v.location?.city || 'N/A',
      region: v.location?.region || 'N/A',
      postcodeAreas: v.postcodeAreas || [],
      rating: v.performance?.rating || 0,
      isClaimed: !v.email?.startsWith('unclaimed-'),
      listingStatus: v.listingStatus || 'unclaimed',
      claimedBy: v.claimedBy || null,
      claimedAt: v.claimedAt || null,
      createdAt: v.createdAt
    }));

    res.json({ success: true, data: vendorsWithDetails });
  } catch (error) {
    console.error('Error fetching vendors:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching vendors.' });
  }
});

// Get single vendor details
router.get('/vendors/:id', adminAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id).select('-password').lean();
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const products = await VendorProduct.find({ vendorId: vendor._id }).lean();
    const leads = await Lead.find({ vendorId: vendor._id }).sort({ createdAt: -1 }).limit(10).lean();

    res.json({
      success: true,
      vendor: {
        ...vendor,
        tier: vendor.tier || vendor.account?.tier || 'free',
        products,
        recentLeads: leads
      }
    });
  } catch (error) {
    console.error('Error fetching vendor:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching vendor.' });
  }
});

// Update vendor tier
router.patch('/vendors/:id/tier', adminAuth, async (req, res) => {
  try {
    const { tier } = req.body;
    const validTiers = ['free', 'visible', 'verified'];

    if (!validTiers.includes(tier)) {
      return res.status(400).json({ success: false, message: 'Invalid tier.' });
    }

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    vendor.tier = tier;
    if (vendor.account) {
      vendor.account.tier = tier;
    }
    await vendor.save();

    console.log(`Admin changed vendor ${vendor._id} tier to ${tier}`);

    res.json({
      success: true,
      message: `Vendor tier updated to ${tier}`,
      vendor: {
        id: vendor._id,
        company: vendor.company,
        tier: vendor.tier
      }
    });
  } catch (error) {
    console.error('Error updating vendor tier:', error.message);
    res.status(500).json({ success: false, message: 'Error updating vendor tier.' });
  }
});

// Update vendor status
router.patch('/vendors/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'pending', 'suspended', 'inactive', 'unclaimed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    if (vendor.account) {
      vendor.account.status = status;
    }
    vendor.status = status;

    // If rejecting a claim, revert listing status
    if (status === 'unclaimed') {
      vendor.listingStatus = 'unclaimed';
    }

    await vendor.save();

    // Send welcome email when activating a vendor
    if (status === 'active') {
      try {
        await sendVendorWelcomeEmail(vendor.email, { vendorName: vendor.name || vendor.company });
      } catch (emailErr) {
        console.error('Failed to send activation email:', emailErr.message);
      }
    }

    res.json({
      success: true,
      message: `Vendor status updated to ${status}`,
      vendor: { id: vendor._id, company: vendor.company, status }
    });
  } catch (error) {
    console.error('Error updating vendor status:', error.message);
    res.status(500).json({ success: false, message: 'Error updating vendor status.' });
  }
});

// Delete a vendor and all associated data
router.delete('/vendors/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    // Delete all associated data in parallel
    await Promise.all([
      VendorProduct.deleteMany({ vendorId: id }),
      VendorLead.deleteMany({ vendor: id }),
      Review.deleteMany({ vendor: id }),
      VendorPost.deleteMany({ vendor: id }),
      GeoAudit.deleteMany({ vendorId: id }),
      AIMentionScan.deleteMany({ vendorId: id }),
    ]);

    await Vendor.findByIdAndDelete(id);

    console.log(`Admin deleted vendor ${id} (${vendor.company})`);
    res.json({ success: true, message: 'Vendor deleted' });
  } catch (error) {
    console.error('Error deleting vendor:', error.message);
    res.status(500).json({ success: false, message: 'Error deleting vendor.' });
  }
});

// Bulk delete vendors and all associated data
router.post('/vendors/bulk-delete', adminAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids array is required.' });
    }

    // Delete all associated data in parallel
    await Promise.all([
      VendorProduct.deleteMany({ vendorId: { $in: ids } }),
      VendorLead.deleteMany({ vendor: { $in: ids } }),
      Review.deleteMany({ vendor: { $in: ids } }),
      VendorPost.deleteMany({ vendor: { $in: ids } }),
      GeoAudit.deleteMany({ vendorId: { $in: ids } }),
      AIMentionScan.deleteMany({ vendorId: { $in: ids } }),
    ]);

    const result = await Vendor.deleteMany({ _id: { $in: ids } });

    console.log(`Admin bulk-deleted ${result.deletedCount} vendors`);
    res.json({ success: true, message: `${result.deletedCount} vendors deleted`, count: result.deletedCount });
  } catch (error) {
    console.error('Error bulk-deleting vendors:', error.message);
    res.status(500).json({ success: false, message: 'Error deleting vendors.' });
  }
});

// Get all leads/enquiries
router.get('/leads', adminAuth, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const leads = await Lead.find(query)
      .populate('vendorId', 'company email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    const leadsWithDetails = leads.map(l => ({
      id: l._id,
      customerName: l.customerName || l.customer?.name || 'N/A',
      customerEmail: l.customerEmail || l.customer?.email || 'N/A',
      customerCompany: l.customerCompany || l.customer?.companyName || 'N/A',
      service: l.service || l.requirements?.service || 'N/A',
      status: l.status || 'pending',
      vendor: l.vendorId ? {
        id: l.vendorId._id,
        company: l.vendorId.company,
        email: l.vendorId.email
      } : null,
      source: l.source || 'website',
      createdAt: l.createdAt
    }));

    res.json({ success: true, data: leadsWithDetails });
  } catch (error) {
    console.error('Error fetching leads:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching leads.' });
  }
});

// Get all quote requests
router.get('/quotes', adminAuth, async (req, res) => {
  try {
    const quotes = await QuoteRequest.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, data: quotes });
  } catch (error) {
    console.error('Error fetching quotes:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching quotes.' });
  }
});

// Export all vendors as CSV for outreach
router.get('/vendors/export/csv', adminAuth, async (req, res) => {
  try {
    const vendors = await Vendor.find({})
      .select('company name email contactInfo.phone location.city location.region tier listingStatus services createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // CSV header
    const csvHeader = 'Company,Contact Name,Email,Phone,City,Region,Tier,Claim Status,Services,Created Date\n';

    // Helper to escape CSV fields
    const escapeCSV = (field) => {
      if (field === null || field === undefined) return '';
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // CSV rows
    const csvRows = vendors.map(v => {
      const services = Array.isArray(v.services) ? v.services.join('; ') : '';
      const createdDate = v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-GB') : '';

      return [
        escapeCSV(v.company),
        escapeCSV(v.name),
        escapeCSV(v.email),
        escapeCSV(v.contactInfo?.phone),
        escapeCSV(v.location?.city),
        escapeCSV(v.location?.region),
        escapeCSV(v.tier || 'free'),
        escapeCSV(v.listingStatus || 'unclaimed'),
        escapeCSV(services),
        escapeCSV(createdDate)
      ].join(',');
    }).join('\n');

    const csv = csvHeader + csvRows;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tendorai-vendors-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);

  } catch (error) {
    console.error('Error exporting vendors:', error.message);
    res.status(500).json({ success: false, message: 'Error exporting vendors.' });
  }
});

// Get all newsletter subscribers
router.get('/subscribers', adminAuth, async (req, res) => {
  try {
    const subscribers = await Subscriber.find({})
      .sort({ subscribedAt: -1 })
      .lean();

    res.json({ success: true, data: subscribers });
  } catch (error) {
    console.error('Error fetching subscribers:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching subscribers.' });
  }
});

// Get all AEO report submissions
router.get('/aeo-reports', adminAuth, async (req, res) => {
  try {
    const reports = await AeoReport.find({})
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: reports });
  } catch (error) {
    console.error('Error fetching AEO reports:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching AEO reports.' });
  }
});

// Get all leads from all sources (combined view)
router.get('/all-leads', adminAuth, async (req, res) => {
  try {
    const { source } = req.query;

    const fetchSource = async (src) => {
      switch (src) {
        case 'newsletter': {
          const subs = await Subscriber.find({}).lean();
          return subs.map(s => ({
            email: s.email,
            name: '',
            company: '',
            source: 'newsletter',
            category: '',
            city: '',
            date: s.subscribedAt || s.createdAt
          }));
        }
        case 'aeo': {
          const reports = await AeoReport.find({}).lean();
          return reports.map(r => ({
            email: r.email,
            name: '',
            company: r.companyName || '',
            source: 'aeo',
            category: r.category || '',
            city: r.city || '',
            date: r.createdAt
          }));
        }
        case 'quote': {
          const quotes = await QuoteRequest.find({}).lean();
          return quotes.map(q => ({
            email: q.email,
            name: q.contactName || '',
            company: q.companyName || '',
            source: 'quote',
            category: q.serviceType || '',
            city: q.location?.postcode || '',
            date: q.createdAt
          }));
        }
        case 'vendor-lead': {
          const leads = await VendorLead.find({}).lean();
          return leads.map(l => ({
            email: l.customer?.email || '',
            name: l.customer?.contactName || '',
            company: l.customer?.companyName || '',
            source: 'vendor-lead',
            category: l.service || '',
            city: l.customer?.postcode || '',
            date: l.createdAt
          }));
        }
        default:
          return [];
      }
    };

    let allLeads = [];
    const sources = source
      ? [source]
      : ['newsletter', 'aeo', 'quote', 'vendor-lead'];

    const results = await Promise.all(sources.map(fetchSource));
    allLeads = results.flat();

    // Sort by date descending
    allLeads.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get counts per source
    const counts = {};
    for (const src of ['newsletter', 'aeo', 'quote', 'vendor-lead']) {
      if (source && source !== src) continue;
      const srcLeads = allLeads.filter(l => l.source === src);
      counts[src] = srcLeads.length;
    }

    // If only counts requested
    if (req.query.counts === 'true') {
      const [newsletterCount, aeoCount, quoteCount, vendorLeadCount] = await Promise.all([
        Subscriber.countDocuments(),
        AeoReport.countDocuments(),
        QuoteRequest.countDocuments(),
        VendorLead.countDocuments()
      ]);
      return res.json({
        success: true,
        counts: {
          newsletter: newsletterCount,
          aeo: aeoCount,
          quote: quoteCount,
          'vendor-lead': vendorLeadCount,
          total: newsletterCount + aeoCount + quoteCount + vendorLeadCount
        }
      });
    }

    res.json({
      success: true,
      data: allLeads,
      counts,
      total: allLeads.length
    });
  } catch (error) {
    console.error('Error fetching all leads:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching leads.' });
  }
});

// ============================================================
// AEO FULL REPORT GENERATION — Admin tools for cold outreach
// ============================================================

/**
 * POST /api/admin/generate-vendor-report
 * Generate a single full AEO visibility report
 * Body: { companyName, category, city, email? }
 */
router.post('/generate-vendor-report', adminAuth, async (req, res) => {
  try {
    const { companyName, category, city, email } = req.body;

    if (!companyName || !category || !city) {
      return res.status(400).json({
        success: false,
        message: 'companyName, category, and city are required.',
      });
    }

    const validCategories = [
      'copiers', 'telecoms', 'cctv', 'it',
      'conveyancing', 'family-law', 'criminal-law', 'commercial-law',
      'employment-law', 'wills-and-probate', 'immigration', 'personal-injury',
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `category must be one of: ${validCategories.join(', ')}`,
      });
    }

    console.log(`[Admin] Generating full AEO report for "${companyName}" (${category}, ${city})`);

    // 1. Generate report data via Claude
    const reportData = await generateFullReport({ companyName, category, city, email });

    // 2. Generate PDF
    const pdfBuffer = await generateReportPdf(reportData);

    // 3. Save to MongoDB
    const report = await AeoReport.create({
      ...reportData,
      pdfBuffer,
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://www.tendorai.com';
    const apiBaseUrl = process.env.API_URL || 'https://ai-procurement-backend.onrender.com';

    console.log(`[Admin] Report generated: ${report._id} — Score: ${report.score}/100`);

    res.json({
      success: true,
      reportId: report._id,
      score: report.score,
      aiMentioned: report.aiMentioned,
      competitors: report.competitors?.length || 0,
      gaps: report.gaps?.length || 0,
      reportUrl: `${baseUrl}/aeo-report/results/${report._id}`,
      pdfUrl: `${apiBaseUrl}/api/public/aeo-report/${report._id}/pdf`,
    });
  } catch (error) {
    console.error('[Admin] Report generation error:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to generate report: ${error.message}`,
    });
  }
});

/**
 * POST /api/admin/generate-vendor-reports-batch
 * Generate multiple full AEO reports sequentially
 * Body: { reports: [{ companyName, category, city, email? }] }
 * Max 10 per batch, 3s delay between each
 */
router.post('/generate-vendor-reports-batch', adminAuth, async (req, res) => {
  try {
    const { reports } = req.body;

    if (!Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'reports array is required.',
      });
    }

    if (reports.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 10 reports per batch.',
      });
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://www.tendorai.com';
    const apiBaseUrl = process.env.API_URL || 'https://ai-procurement-backend.onrender.com';
    const results = [];

    for (let i = 0; i < reports.length; i++) {
      const { companyName, category, city, email } = reports[i];

      try {
        if (!companyName || !category || !city) {
          results.push({ companyName, success: false, error: 'Missing required fields' });
          continue;
        }

        console.log(`[Admin Batch] ${i + 1}/${reports.length}: "${companyName}" (${category}, ${city})`);

        const reportData = await generateFullReport({ companyName, category, city, email });
        const pdfBuffer = await generateReportPdf(reportData);
        const report = await AeoReport.create({ ...reportData, pdfBuffer });

        results.push({
          companyName,
          success: true,
          reportId: report._id,
          score: report.score,
          reportUrl: `${baseUrl}/aeo-report/results/${report._id}`,
          pdfUrl: `${apiBaseUrl}/api/public/aeo-report/${report._id}/pdf`,
        });

        // 3s delay between reports to avoid rate limits
        if (i < reports.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      } catch (err) {
        console.error(`[Admin Batch] Failed: "${companyName}" — ${err.message}`);
        results.push({ companyName, success: false, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('[Admin Batch] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
