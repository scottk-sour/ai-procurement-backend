import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import OutreachLog from '../models/OutreachLog.js';
import Vendor from '../models/Vendor.js';
import { sendEmail } from '../services/emailService.js';

const router = express.Router();

const { ADMIN_JWT_SECRET } = process.env;

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
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

router.use(adminAuth);

// POST /send-email — send Email 1 or Email 2 to selected outreach records via Resend
router.post('/send-email', async (req, res) => {
  try {
    const { ids, emailType } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !['email1', 'email2'].includes(emailType)) {
      return res.status(400).json({ success: false, message: 'ids (array) and emailType ("email1" or "email2") are required' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ success: false, message: 'Maximum 50 records per batch' });
    }

    const records = await OutreachLog.find({ _id: { $in: ids } }).lean();

    // Filter to eligible records
    const eligible = records.filter((r) => {
      if (!r.contactEmail) return false;
      if (emailType === 'email1') return !r.email1SentAt;
      if (emailType === 'email2') {
        if (!r.email1SentAt) return false;
        const daysSince = (Date.now() - new Date(r.email1SentAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince >= 5 && !r.email2SentAt;
      }
      return false;
    });

    if (eligible.length === 0) {
      return res.status(400).json({ success: false, message: 'No eligible records found' });
    }

    const results = [];
    let sent = 0;
    let failed = 0;

    for (const record of eligible) {
      const sector = (record.vendorType || record.reportCategory || 'professional services firm').replace(/-/g, ' ');
      const city = record.reportCity || 'your area';
      const score = record.reportScore || 0;

      let subject, body;
      const scoreLine = score > 0
        ? `We ran a quick AI visibility check and your firm is currently scoring ${score}/100 — which means AI tools like ChatGPT and Perplexity are unlikely to recommend you when potential clients search for a ${sector} in ${city}.`
        : `We ran a quick AI visibility check and your firm isn't currently appearing when AI tools like ChatGPT and Perplexity are asked to recommend a ${sector} in ${city}.`;

      if (emailType === 'email1') {
        subject = `${record.firmName} — your AI visibility score`;
        body = `Hi,

I wanted to share something we found about ${record.firmName}.

${scoreLine}

We've already created a profile for ${record.firmName} on TendorAI — the UK's AI visibility platform for regulated professional services firms. It's free to claim.

TendorAI Pro (£299/month) goes further — we install the correct Schema.org markup on your website and track your AI citations across all major platforms.

You can see your full report here:
https://www.tendorai.com/aeo-report

Happy to walk you through it on a quick call.

Scott Davies
TendorAI
tendorai.com`;
      } else {
        subject = `Following up — ${record.firmName} AI visibility`;
        body = `Hi,

Just following up on my email from last week about ${record.firmName}'s AI visibility score.

AI search is moving fast — firms that get set up now will have a significant advantage over those that wait. We're still offering early access at £299/month (rising to £599 as we scale).

If you'd like to see exactly where ${record.firmName} stands and what it would take to appear in AI recommendations, I'm happy to run through it with you.

Just reply to this email or book a call:
https://www.tendorai.com/contact

Scott Davies
TendorAI
tendorai.com`;
      }

      try {
        await sendEmail({
          to: record.contactEmail,
          subject,
          text: body,
          html: body.replace(/\n/g, '<br>'),
          from: 'Scott Davies <scott@tendorai.com>',
        });

        const updateFields = emailType === 'email1'
          ? { email1SentAt: new Date(), status: 'email_sent', nextAction: 'call', nextActionDate: new Date() }
          : { email2SentAt: new Date(), status: 'email_followup_sent', nextAction: 'call_followup', nextActionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) };

        const historyEntry = {
          action: `${emailType}_sent`,
          note: `${emailType === 'email1' ? 'Email 1 — Initial Outreach' : 'Email 2 — Follow Up'} sent via Resend to ${record.contactEmail}`,
          subject,
          body,
          date: new Date(),
          completedBy: 'admin',
        };

        await OutreachLog.findByIdAndUpdate(record._id, {
          $set: updateFields,
          $push: { history: historyEntry },
        });

        sent++;
        results.push({ id: record._id, status: 'sent' });
      } catch (emailErr) {
        failed++;
        results.push({ id: record._id, status: 'failed', error: emailErr.message });
      }
    }

    if (failed > 0 && sent === 0) {
      return res.status(500).json({ success: false, message: 'Email sending failed', sent, failed, results });
    }

    res.json({ success: true, sent, failed, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /today — records with nextActionDate = today, sorted by status priority
router.get('/today', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const records = await OutreachLog.find({
      nextActionDate: { $gte: startOfDay, $lt: endOfDay },
    }).lean();

    // Sort by status priority
    const priority = {
      'call-back': 0,
      'interested': 1,
      'opened': 2,
      'email-sent': 3,
      'new': 4,
      'called': 5,
      'signed-up': 6,
      'not-interested': 7,
    };
    records.sort((a, b) => (priority[a.status] ?? 99) - (priority[b.status] ?? 99));

    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /upcoming — records with nextActionDate within 7 days, grouped by date
router.get('/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);

    const records = await OutreachLog.find({
      nextActionDate: { $gte: startOfDay, $lt: endDate },
    })
      .sort({ nextActionDate: 1 })
      .lean();

    // Group by YYYY-MM-DD
    const grouped = {};
    records.forEach((r) => {
      const key = r.nextActionDate.toISOString().split('T')[0];
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });

    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /stats — aggregate status counts + distinct cities + overdue/due today
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const [statusCounts, cities, dueToday, overdue, total, email1Sent, email2Sent, withEmail, replied] = await Promise.all([
      OutreachLog.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      OutreachLog.distinct('reportCity'),
      OutreachLog.countDocuments({ nextActionDate: { $gte: startOfDay, $lt: endOfDay } }),
      OutreachLog.countDocuments({ nextActionDate: { $lt: startOfDay }, nextAction: { $ne: 'none', $ne: '' } }),
      OutreachLog.countDocuments({}),
      OutreachLog.countDocuments({ email1SentAt: { $ne: null } }),
      OutreachLog.countDocuments({ email2SentAt: { $ne: null } }),
      OutreachLog.countDocuments({ contactEmail: { $ne: '' } }),
      OutreachLog.countDocuments({ status: { $in: ['interested', 'meeting_booked'] } }),
    ]);

    const counts = {};
    statusCounts.forEach((s) => {
      counts[s._id] = s.count;
    });

    const won = counts['won'] || counts['signed-up'] || 0;
    const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;

    res.json({
      success: true,
      data: {
        total,
        counts,
        cities: cities.filter(Boolean).sort(),
        dueToday,
        overdue,
        won,
        conversionRate,
        email1Sent,
        email2Sent,
        withEmail,
        replied,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET / — list with filters, search, pagination
router.get('/', async (req, res) => {
  try {
    const {
      status,
      city,
      category,
      fromDate,
      toDate,
      search,
      scoreMax,
      hasEmail,
      tier,
      page = '1',
      limit = '25',
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (city) filter.reportCity = city;
    if (category) filter.reportCategory = category;
    if (fromDate || toDate) {
      filter.nextActionDate = {};
      if (fromDate) filter.nextActionDate.$gte = new Date(fromDate);
      if (toDate) filter.nextActionDate.$lte = new Date(toDate);
    }
    if (search) {
      filter.firmName = { $regex: search, $options: 'i' };
    }
    if (scoreMax) {
      filter.reportScore = { $lt: parseInt(scoreMax) };
    }
    if (hasEmail === 'yes') {
      filter.contactEmail = { $ne: '' };
    } else if (hasEmail === 'no') {
      filter.contactEmail = { $in: ['', null] };
    }
    // Tier filter: requires a lookup against the Vendor collection via vendorId
    if (tier === 'free') {
      // Vendor imported at top of file
      const freeVendorIds = await Vendor.find({ tier: 'free' }).distinct('_id');
      filter.$or = [
        { vendorId: { $in: freeVendorIds } },
        { vendorId: null },
        { vendorId: { $exists: false } },
      ];
    } else if (tier === 'pro') {
      // Vendor imported at top of file
      const proVendorIds = await Vendor.find({ tier: { $in: ['pro', 'basic', 'managed', 'verified', 'enterprise'] } }).distinct('_id');
      filter.vendorId = { $in: proVendorIds };
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      OutreachLog.find(filter)
        .sort({ nextActionDate: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OutreachLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id — single record with populated vendorId
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const record = await OutreachLog.findById(req.params.id)
      .populate('vendorId', 'company email')
      .lean();
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST / — create new record with auto-defaults
router.post('/', async (req, res) => {
  try {
    if (!req.body.firmName) {
      return res.status(400).json({ success: false, error: 'firmName is required' });
    }
    const data = { ...req.body };
    if (!data.status) data.status = 'prospect';
    if (!data.nextAction) data.nextAction = 'run_aeo';
    if (!data.nextActionDate) data.nextActionDate = new Date();
    if (!data.history) {
      data.history = [{ action: 'created', note: 'Prospect added to outreach', date: new Date(), completedBy: 'admin' }];
    }
    const record = await OutreachLog.create(data);
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Status → next action auto-mapping
function getNextStep(status) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const map = {
    'aeo_sent':            { nextAction: 'send_email', nextActionDate: tomorrow },
    'email_sent':          { nextAction: 'call',       nextActionDate: now },
    'email-sent':          { nextAction: 'call',       nextActionDate: now },
    'called':              { nextAction: 'send_followup', nextActionDate: inTwoDays },
    'email_followup_sent': { nextAction: 'call_followup', nextActionDate: inTwoDays },
    'called_followup':     { nextAction: 'none',       nextActionDate: null },
    'interested':          { nextAction: 'none',       nextActionDate: null },
    'meeting_booked':      { nextAction: 'none',       nextActionDate: null },
    'won':                 { nextAction: 'none',       nextActionDate: null },
    'signed-up':           { nextAction: 'none',       nextActionDate: null },
    'lost':                { nextAction: 'none',       nextActionDate: null },
    'not-interested':      { nextAction: 'none',       nextActionDate: null },
    'no_response':         { nextAction: 'none',       nextActionDate: null },
  };
  return map[status] || null;
}

// PUT /:id — update record with auto-advance
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }

    const updateData = { ...req.body };

    // Auto-advance sales sequence when status changes
    if (updateData.status) {
      const step = getNextStep(updateData.status);
      if (step) {
        if (!updateData.nextAction) updateData.nextAction = step.nextAction;
        if (!updateData.nextActionDate) updateData.nextActionDate = step.nextActionDate;
      }
      // Push to history
      updateData.$push = {
        history: {
          action: `status_${updateData.status}`,
          note: `Status changed to ${updateData.status}`,
          date: new Date(),
          completedBy: 'admin',
        },
      };
      // Remove status from $set to avoid conflict
      const { status, ...rest } = updateData;
      delete rest.$push;
      const record = await OutreachLog.findByIdAndUpdate(
        req.params.id,
        {
          $set: { status, ...rest },
          $push: updateData.$push,
        },
        { new: true, runValidators: true }
      );
      if (!record) {
        return res.status(404).json({ success: false, error: 'Record not found' });
      }
      return res.json({ success: true, data: record });
    }

    const record = await OutreachLog.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/history — add a history entry
router.post('/:id/history', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const { action, note } = req.body;
    if (!action) {
      return res.status(400).json({ success: false, error: 'action is required' });
    }
    const record = await OutreachLog.findByIdAndUpdate(
      req.params.id,
      { $push: { history: { action, note: note || '', date: new Date(), completedBy: 'admin' } } },
      { new: true }
    );
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/note — add a note
router.post('/:id/note', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }
    const record = await OutreachLog.findByIdAndUpdate(
      req.params.id,
      { $push: { notes: { text, createdAt: new Date() } } },
      { new: true }
    );
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/call — log a call
router.post('/:id/call', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const { notes, outcome, nextActionDate, nextAction } = req.body;

    const update = {
      $push: {
        callHistory: {
          calledAt: new Date(),
          notes: notes || '',
          outcome: outcome || 'called',
          nextActionDate: nextActionDate ? new Date(nextActionDate) : undefined,
        },
      },
      $set: {
        lastCalledAt: new Date(),
        status: outcome || 'called',
      },
    };

    if (nextActionDate) {
      update.$set.nextActionDate = new Date(nextActionDate);
    }
    if (nextAction) {
      update.$set.nextAction = nextAction;
    }

    const record = await OutreachLog.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id — delete record
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const record = await OutreachLog.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
