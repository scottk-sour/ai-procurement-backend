import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import ApprovalQueue from '../models/ApprovalQueue.js';
import Vendor from '../models/Vendor.js';
import { isValidFirmDataKey, getFirmDataLabel } from '../services/writerAgent/firmDataKeys.js';
import { countAllPlaceholders } from '../services/writerAgent/parsePlaceholders.js';

const router = express.Router();

router.use(vendorAuth);

// GET /api/vendor/approvals
router.get('/', async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const { status, itemType, page, limit } = req.query;

    const filter = { vendorId };
    filter.status = status || 'pending';
    if (itemType) filter.itemType = itemType;

    const lim = Math.min(parseInt(limit) || 20, 100);
    const pg = parseInt(page) || 1;
    const skip = (pg - 1) * lim;

    const [items, total] = await Promise.all([
      ApprovalQueue.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .select('-decidedBy -executionResult -executionError')
        .lean(),
      ApprovalQueue.countDocuments(filter),
    ]);

    res.json({
      success: true,
      items,
      pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/approvals/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await ApprovalQueue.findById(req.params.id)
      .select('-decidedBy -executionResult -executionError')
      .lean();

    if (!item) {
      return res.status(404).json({ success: false, error: 'Approval item not found' });
    }

    if (item.vendorId.toString() !== req.vendorId.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vendor/approvals/:id/firm-data — save one firmData answer
router.post('/:id/firm-data', async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ success: false, error: 'key is required' });
    }
    if (!isValidFirmDataKey(key)) {
      return res.status(400).json({ success: false, error: `Unknown firmData key: "${key}". Only registered keys are accepted.` });
    }
    if (value === undefined || value === null) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    const approval = await ApprovalQueue.findById(req.params.id);
    if (!approval) {
      return res.status(404).json({ success: false, error: 'Approval item not found' });
    }
    if (approval.vendorId.toString() !== req.vendorId.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (!['pending', 'firm_completed'].includes(approval.status)) {
      return res.status(400).json({ success: false, error: `Cannot edit firm data on approval with status "${approval.status}"` });
    }

    // Save to vendor.firmData
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor.firmData) vendor.firmData = new Map();
    vendor.firmData.set(key, {
      value: String(value),
      label: getFirmDataLabel(key),
      updatedAt: new Date(),
      updatedBy: 'firm',
    });
    await vendor.save();

    // Replace [FIRM_DATA: key | ...] in draft content
    const keyPattern = new RegExp(`\\[FIRM_DATA:\\s*${key}\\s*\\|[^\\]]*\\]`, 'g');
    if (approval.draftPayload?.body) {
      approval.draftPayload.body = approval.draftPayload.body.replace(keyPattern, String(value));
    }
    if (approval.draftPayload?.linkedInText) {
      approval.draftPayload.linkedInText = approval.draftPayload.linkedInText.replace(keyPattern, String(value));
    }
    if (approval.draftPayload?.facebookText) {
      approval.draftPayload.facebookText = approval.draftPayload.facebookText.replace(keyPattern, String(value));
    }
    approval.markModified('draftPayload');
    await approval.save();

    const allContent = [
      approval.draftPayload?.body || '',
      approval.draftPayload?.linkedInText || '',
      approval.draftPayload?.facebookText || '',
    ].join('\n');
    const remainingPlaceholders = countAllPlaceholders(allContent);

    res.json({ success: true, filledKey: key, remainingPlaceholders });
  } catch (err) {
    console.error('[firm-data] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vendor/approvals/:id/firm-approve — firm marks draft as complete
router.post('/:id/firm-approve', async (req, res) => {
  try {
    const approval = await ApprovalQueue.findById(req.params.id);
    if (!approval) {
      return res.status(404).json({ success: false, error: 'Approval item not found' });
    }
    if (approval.vendorId.toString() !== req.vendorId.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (approval.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Cannot firm-approve from status "${approval.status}"` });
    }

    const allContent = [
      approval.draftPayload?.body || '',
      approval.draftPayload?.linkedInText || '',
      approval.draftPayload?.facebookText || '',
    ].join('\n');
    const remaining = countAllPlaceholders(allContent);

    if (remaining > 0) {
      return res.status(400).json({
        success: false,
        error: `${remaining} placeholder(s) remaining. Fill all placeholders before approving.`,
        remainingPlaceholders: remaining,
      });
    }

    approval.status = 'firm_completed';
    approval.firmApprovedAt = new Date();
    approval.firmApprovedBy = req.vendorId.toString();
    await approval.save();

    res.json({ success: true, status: approval.status, firmApprovedAt: approval.firmApprovedAt });
  } catch (err) {
    console.error('[firm-approve] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
