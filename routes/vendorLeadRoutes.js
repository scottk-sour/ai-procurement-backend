// routes/vendorLeadRoutes.js
// Public API for submitting quote requests to vendors (no auth required)

import express from 'express';
import VendorLead from '../models/VendorLead.js';
import Vendor from '../models/Vendor.js';
import vendorAuth from '../middleware/vendorAuth.js';

const router = express.Router();

/**
 * POST /api/vendor-leads
 * Submit a quote request to a vendor (public - no auth required)
 */
router.post('/', async (req, res) => {
  try {
    // Debug: Log incoming request body
    console.log('[VendorLead] Incoming request body:', JSON.stringify(req.body, null, 2));

    const {
      vendorId,
      service,
      equipmentType,
      monthlyVolume,
      currentSetup,
      features,
      timeline,
      contractPreference,
      budgetRange,
      companyName,
      contactName,
      email,
      phone,
      postcode,
      message,
      source
    } = req.body;

    // Validate vendor exists and can receive quotes
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Check if vendor can receive quotes (paid tier or has showPricing)
    const tier = (vendor.account?.tier || vendor.tier || 'free').toLowerCase();
    const paidTiers = ['basic', 'managed', 'enterprise', 'standard', 'visible', 'verified', 'gold', 'platinum', 'silver', 'bronze'];
    const canReceiveQuotes = paidTiers.includes(tier) || vendor.showPricing === true;

    if (!canReceiveQuotes) {
      return res.status(403).json({
        success: false,
        error: 'This supplier is not currently accepting quote requests'
      });
    }

    // Create the lead
    const lead = new VendorLead({
      vendor: vendorId,
      service,
      equipmentType,
      monthlyVolume,
      currentSetup,
      features: features || [],
      timeline,
      contractPreference,
      budgetRange,
      customer: {
        companyName,
        contactName,
        email,
        phone,
        postcode,
        message
      },
      source: source || {},
      status: 'pending'
    });

    await lead.save();

    // TODO: Send email notification to vendor
    // TODO: Send confirmation email to customer

    res.json({
      success: true,
      data: {
        id: lead._id,
        message: 'Your quote request has been submitted successfully. The supplier will contact you shortly.'
      }
    });

  } catch (error) {
    console.error('Vendor lead submission error:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: 'Please check your submission',
        details: messages
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to submit quote request. Please try again.'
    });
  }
});

/**
 * GET /api/vendor-leads/vendor/me
 * Get leads for the authenticated vendor (uses JWT to resolve vendorId)
 */
router.get('/vendor/me', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { vendor: vendorId };
    if (status) {
      query.status = status;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [leads, total] = await Promise.all([
      VendorLead.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      VendorLead.countDocuments(query)
    ]);

    const statusCounts = await VendorLead.aggregate([
      { $match: { vendor: vendorId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const counts = statusCounts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        leads,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        },
        counts: {
          pending: counts.pending || 0,
          viewed: counts.viewed || 0,
          contacted: counts.contacted || 0,
          quoted: counts.quoted || 0,
          won: counts.won || 0,
          lost: counts.lost || 0
        }
      }
    });

  } catch (error) {
    console.error('Get vendor leads (me) error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

/**
 * GET /api/vendor-leads/vendor/:vendorId
 * Get leads for a vendor by ID (kept for backward compatibility)
 */
router.get('/vendor/:vendorId', vendorAuth, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Ensure vendor can only access their own leads
    if (req.vendorId?.toString() !== vendorId) {
      return res.status(403).json({ success: false, error: 'Not authorised to view these leads' });
    }

    const query = { vendor: vendorId };
    if (status) {
      query.status = status;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [leads, total] = await Promise.all([
      VendorLead.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      VendorLead.countDocuments(query)
    ]);

    // Count by status
    const statusCounts = await VendorLead.aggregate([
      { $match: { vendor: vendorId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const counts = statusCounts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        leads,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        },
        counts: {
          pending: counts.pending || 0,
          viewed: counts.viewed || 0,
          contacted: counts.contacted || 0,
          quoted: counts.quoted || 0,
          won: counts.won || 0,
          lost: counts.lost || 0
        }
      }
    });

  } catch (error) {
    console.error('Get vendor leads error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

/**
 * PATCH /api/vendor-leads/:leadId/status
 * Update lead status (requires vendor auth)
 */
router.patch('/:leadId/status', vendorAuth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, note, quoteValue } = req.body;

    const lead = await VendorLead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    // Update status
    lead.status = status;

    // Set timestamp based on status
    const now = new Date();
    switch (status) {
      case 'viewed':
        if (!lead.viewedAt) lead.viewedAt = now;
        break;
      case 'contacted':
        if (!lead.contactedAt) lead.contactedAt = now;
        break;
      case 'quoted':
        if (!lead.quotedAt) lead.quotedAt = now;
        if (quoteValue) lead.quoteValue = quoteValue;
        break;
      case 'won':
      case 'lost':
        if (!lead.closedAt) lead.closedAt = now;
        break;
    }

    // Add note if provided
    if (note) {
      lead.vendorNotes.push({ note, addedAt: now });
    }

    await lead.save();

    res.json({
      success: true,
      data: lead
    });

  } catch (error) {
    console.error('Update lead status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead' });
  }
});

/**
 * GET /api/vendor-leads/:leadId
 * Get single lead details
 */
router.get('/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    const lead = await VendorLead.findById(leadId)
      .populate('vendor', 'company name email')
      .lean();

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    res.json({
      success: true,
      data: lead
    });

  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
  }
});

export default router;
