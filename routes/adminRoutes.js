// routes/adminRoutes.js
// TendorAI Admin Dashboard API

import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Lead from '../models/Lead.js';
import VendorProduct from '../models/VendorProduct.js';
import 'dotenv/config';

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
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
  }

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    try {
      const token = jwt.sign({ role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '8h' });
      return res.status(200).json({ status: 'success', token, message: 'Login successful.' });
    } catch (error) {
      console.error('Error generating token:', error.message);
      return res.status(500).json({ status: 'error', message: 'Internal server error.' });
    }
  } else {
    return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
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
      managed: 0
    };
    vendorsByTier.forEach(t => {
      if (t._id) tierBreakdown[t._id] = t.count;
    });

    // Active subscriptions
    const activeSubscriptions = await Vendor.countDocuments({ subscriptionStatus: 'active' });

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
        recentVendors,
        tierBreakdown
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
      .select('company name email services tier account subscriptionStatus stripeCustomerId stripeSubscriptionId createdAt location performance')
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
      status: v.account?.status || 'pending',
      subscriptionStatus: v.subscriptionStatus || 'none',
      hasStripe: !!v.stripeCustomerId,
      productCount: productCountMap[v._id.toString()] || 0,
      location: v.location?.city || v.location?.region || 'N/A',
      rating: v.performance?.rating || 0,
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
    const validTiers = ['free', 'visible', 'verified', 'basic', 'managed', 'enterprise'];

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
    const validStatuses = ['active', 'pending', 'suspended', 'inactive'];

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
    await vendor.save();

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

export default router;
