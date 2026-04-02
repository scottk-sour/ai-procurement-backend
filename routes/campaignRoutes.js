import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Campaign from '../models/Campaign.js';
import OutreachLog from '../models/OutreachLog.js';
import Vendor from '../models/Vendor.js';
import { sendEmail } from '../services/emailService.js';

const router = express.Router();
const { ADMIN_JWT_SECRET } = process.env;

const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Access denied.' });
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ success: false, message: 'Not authorized.' });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

router.use(adminAuth);

// Map campaign sector values to Vendor model vendorType values
// The Vendor model uses 'mortgage-advisor', outreach uses 'mortgage-adviser'
function sectorToVendorType(sector) {
  const map = {
    'solicitor': 'solicitor',
    'accountant': 'accountant',
    'mortgage-adviser': 'mortgage-advisor',
    'estate-agent': 'estate-agent',
  };
  return map[sector] || sector;
}

function sectorToOutreachType(sector) {
  // OutreachLog uses 'mortgage-adviser'
  return sector;
}

// Build Vendor query from campaign filters
function buildVendorQuery(campaign) {
  const query = {};

  if (campaign.sector && campaign.sector !== 'all') {
    query.vendorType = sectorToVendorType(campaign.sector);
  }

  if (campaign.city) {
    query['location.city'] = { $regex: new RegExp(`^${campaign.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
  }

  if (campaign.tierFilter === 'free') {
    query.tier = 'free';
  } else if (campaign.tierFilter === 'pro') {
    query.tier = { $in: ['pro', 'basic', 'managed', 'verified', 'enterprise'] };
  }

  // Must have email
  query.email = { $exists: true, $ne: '' };

  return query;
}

// GET / — list all campaigns
router.get('/', async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: campaigns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /preview — count matching vendors without creating campaign
router.post('/preview', async (req, res) => {
  try {
    const { sector, city, tierFilter } = req.body;
    const query = buildVendorQuery({ sector: sector || 'all', city: city || '', tierFilter: tierFilter || 'all' });

    // Vendor imported at top of file

    // Get emails already in outreach
    const existingEmails = await OutreachLog.distinct('contactEmail');
    const existingSet = new Set(existingEmails.filter(Boolean).map(e => e.toLowerCase()));

    const vendors = await Vendor.find(query)
      .select('email company vendorType location.city tier')
      .lean();

    const eligible = vendors.filter(v => v.email && !existingSet.has(v.email.toLowerCase()));

    res.json({
      success: true,
      totalMatching: vendors.length,
      alreadyInOutreach: vendors.length - eligible.length,
      eligible: eligible.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST / — create campaign
router.post('/', async (req, res) => {
  try {
    const { name, sector, city, tierFilter, maxFirms } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Campaign name is required' });
    }
    const campaign = await Campaign.create({
      name: name.trim(),
      sector: sector || 'all',
      city: (city || '').trim(),
      tierFilter: tierFilter || 'all',
      maxFirms: Math.min(Math.max(parseInt(maxFirms) || 50, 1), 200),
      emailType: 'email1',
      status: 'draft',
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /:id — campaign detail
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /:id — update campaign (status, name, etc.)
router.patch('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const allowed = ['name', 'sector', 'city', 'tierFilter', 'maxFirms', 'status'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const campaign = await Campaign.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /:id/run — execute campaign
router.post('/:id/run', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status === 'complete') {
      return res.status(400).json({ success: false, message: 'Campaign already completed' });
    }
    if (campaign.status === 'active') {
      return res.status(400).json({ success: false, message: 'Campaign is already running' });
    }

    // Mark as active
    campaign.status = 'active';
    campaign.startedAt = new Date();
    await campaign.save();

    // Vendor imported at top of file
    const query = buildVendorQuery(campaign);

    // Get emails already in outreach to avoid duplicates
    const existingEmails = await OutreachLog.distinct('contactEmail');
    const existingSet = new Set(existingEmails.filter(Boolean).map(e => e.toLowerCase()));

    const vendors = await Vendor.find(query)
      .select('_id email company vendorType location.city contactInfo.phone contactInfo.website tier')
      .lean();

    const eligible = vendors.filter(v => v.email && !existingSet.has(v.email.toLowerCase()));
    const toProcess = eligible.slice(0, campaign.maxFirms);

    campaign.firmsMatched = eligible.length;
    await campaign.save();

    // Daily send limit (Resend free tier = 100/day, be conservative)
    const DAILY_LIMIT = 50;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await OutreachLog.countDocuments({ email1SentAt: { $gte: today } });
    const remaining = Math.max(0, DAILY_LIMIT - sentToday);
    const batch = toProcess.slice(0, remaining);
    const paused = remaining < toProcess.length;

    let sent = 0;
    let errors = 0;
    const outreachIds = [];

    for (const vendor of batch) {
      try {
        const sector = (vendor.vendorType || '').replace(/-/g, ' ') || 'professional services firm';
        const city = vendor.location?.city || 'your area';
        const outreachSector = vendor.vendorType === 'mortgage-advisor' ? 'mortgage-adviser' : (vendor.vendorType || '');

        // Create outreach record
        const outreach = await OutreachLog.create({
          vendorId: vendor._id,
          firmName: vendor.company,
          contactEmail: vendor.email,
          contactPhone: vendor.contactInfo?.phone || '',
          website: vendor.contactInfo?.website || '',
          reportCategory: outreachSector,
          reportCity: vendor.location?.city || '',
          vendorType: outreachSector,
          status: 'prospect',
          nextAction: 'send_email',
          nextActionDate: new Date(),
          history: [{ action: 'created', note: `Added via campaign: ${campaign.name}`, date: new Date(), completedBy: 'campaign' }],
        });

        // Send Email 1
        const subject = `${vendor.company} — your AI visibility score`;
        const body = `Hi,

I wanted to share something we found about ${vendor.company}.

We ran a quick AI visibility check and your firm is currently scoring 0/100 — which means AI tools like ChatGPT and Perplexity are unlikely to recommend you when potential clients search for a ${sector} in ${city}.

We've already created a profile for ${vendor.company} on TendorAI — the UK's AI visibility platform for regulated professional services firms. It's free to claim.

TendorAI Pro (£299/month) goes further — we install the correct Schema.org markup on your website and track your AI citations across all major platforms.

You can see your full report here:
https://www.tendorai.com/aeo-report

Happy to walk you through it on a quick call.

Scott Davies
TendorAI
tendorai.com`;

        await sendEmail({
          to: vendor.email,
          subject,
          text: body,
          html: body.replace(/\n/g, '<br>'),
          from: 'Scott Davies <scott@tendorai.com>',
        });

        // Update outreach record with email sent
        await OutreachLog.findByIdAndUpdate(outreach._id, {
          $set: { email1SentAt: new Date(), status: 'email_sent', nextAction: 'call', nextActionDate: new Date() },
          $push: { history: { action: 'email1_sent', note: `Email 1 sent via campaign: ${campaign.name}`, subject, body, date: new Date(), completedBy: 'campaign' } },
        });

        outreachIds.push(outreach._id);
        sent++;
      } catch (err) {
        console.error(`Campaign ${campaign.name}: failed for ${vendor.email}: ${err.message}`);
        errors++;
      }
    }

    // Update campaign
    campaign.firmsContacted = sent;
    campaign.emailsSent = sent;
    campaign.errorCount = errors;
    campaign.outreachIds = outreachIds;

    if (paused) {
      campaign.status = 'paused';
    } else {
      campaign.status = 'complete';
      campaign.completedAt = new Date();
    }
    await campaign.save();

    const result = {
      success: true,
      data: campaign.toObject(),
      summary: {
        firmsMatched: campaign.firmsMatched,
        firmsContacted: sent,
        emailsSent: sent,
        errors,
      },
    };

    if (paused) {
      result.paused = true;
      result.pauseReason = `Daily limit reached (${DAILY_LIMIT}/day). Sent ${sent} of ${toProcess.length}. Remainder queued for tomorrow.`;
    }

    res.json(result);
  } catch (err) {
    // If something fails, mark campaign with error state
    try {
      await Campaign.findByIdAndUpdate(req.params.id, { status: 'paused' });
    } catch { /* ignore */ }
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const campaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
