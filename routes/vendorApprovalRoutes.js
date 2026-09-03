import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import ApprovalQueue from '../models/ApprovalQueue.js';
import ContentApprovalRecord from '../models/ContentApprovalRecord.js';
import { firmApproveAndExecute, firmRejectItem, firmRepublish } from '../services/approvalQueue.js';
import { pingBingIndexNow } from '../services/indexNowService.js';

const router = express.Router();

router.use(vendorAuth);

// GET /api/vendor/approvals — firms see only admin-approved drafts
router.get('/', async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const { status, itemType, page, limit } = req.query;

    const filter = { vendorId };
    filter.status = status || 'approved';
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

// GET /api/vendor/approvals/history — this firm's complete content-approval
// history, read only from the immutable ContentApprovalRecord collection.
// Scoped to req.vendorId, so a firm can only ever see its own records.
// Historical posts approved before this system existed have no record and are
// therefore (correctly) absent — nothing is backfilled or reconstructed.
// NOTE: must be declared before GET '/:id' so "history" is not treated as an id.
router.get('/history', async (req, res) => {
  try {
    const records = await ContentApprovalRecord.find({ vendorId: req.vendorId })
      .sort({ approvedAt: -1 })
      .lean();

    res.json({
      success: true,
      total: records.length,
      records: records.map((r) => ({
        approvalItemId: r.approvalItemId,
        vendorAccountId: r.approvedByVendorAccountId,
        approverName: r.approverName,
        approverRole: r.approverRole,
        registrationNumber: r.approverRegistrationNumber,
        regulator: r.approverRegulator,
        approvedAt: r.approvedAt,
        qualifiedPersonConfirmation: r.qualifiedPersonConfirmation,
        individuallyAuthenticated: r.individuallyAuthenticated,
        identityAssurance: r.identityAssurance,
      })),
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

    if (!['approved', 'firm_completed', 'executed'].includes(item.status)) {
      return res.status(403).json({ success: false, error: 'This draft is not available for review yet' });
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
    if (!['approved', 'executed'].includes(approval.status)) {
      return res.status(400).json({ success: false, error: `Cannot edit firm data on approval with status "${approval.status}"` });
    }

    if (approval.itemType === 'content_draft') {
      const bodyText = [approval.draftPayload?.body || '', approval.draftPayload?.linkedInText || '', approval.draftPayload?.facebookText || ''].join('\n');
      const keyPattern = new RegExp(`\\[FIRM_DATA:\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|`, 'i');
      if (!keyPattern.test(bodyText)) {
        const presentKeys = [...(bodyText.matchAll(/\[FIRM_DATA:\s*([a-zA-Z_]+)\s*\|/gi))].map(m => m[1]);
        const unique = [...new Set(presentKeys)];
        return res.status(400).json({
          success: false,
          error: `Key "${key}" not found in this draft. Available keys: ${unique.length > 0 ? unique.join(', ') : '(none)'}`,
        });
      }
    }

    if (!approval.firmData) approval.firmData = new Map();
    approval.firmData.set(key, String(value));
    approval.markModified('firmData');
    await approval.save();

    const bodyText = [approval.draftPayload?.body || '', approval.draftPayload?.linkedInText || '', approval.draftPayload?.facebookText || ''].join('\n');
    const allPlaceholderKeys = [...new Set([...(bodyText.matchAll(/\[FIRM_DATA:\s*([a-zA-Z_]+)\s*\|/gi))].map(m => m[1]))];
    const filledKeys = allPlaceholderKeys.filter(k => approval.firmData.has(k));
    const remainingCount = allPlaceholderKeys.length - filledKeys.length;

    res.json({ success: true, filledKey: key, remainingPlaceholders: remainingCount, filledCount: filledKeys.length, totalPlaceholders: allPlaceholderKeys.length });
  } catch (err) {
    console.error('[firm-data] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vendor/approvals/:id/firm-approve — firm approves and auto-publishes
router.post('/:id/firm-approve', async (req, res) => {
  try {
    // (5/6) Explicit qualified-person confirmation is required and must be true.
    // Represents: "I confirm I am a qualified person and have reviewed this
    // content in accordance with our regulatory obligations."
    const { qualifiedPersonConfirmation } = req.body || {};
    if (qualifiedPersonConfirmation !== true) {
      return res.status(400).json({
        success: false,
        error: 'You must confirm that you are a qualified person and have reviewed this content in accordance with your regulatory obligations before it can be approved.',
      });
    }

    const preCheck = await ApprovalQueue.findById(req.params.id).select('draftPayload firmData vendorId status').lean();
    if (preCheck && preCheck.vendorId?.toString() === req.vendorId.toString()) {
      const bodyText = [preCheck.draftPayload?.body || '', preCheck.draftPayload?.linkedInText || '', preCheck.draftPayload?.facebookText || ''].join('\n');
      const allPlaceholderKeys = [...new Set([...(bodyText.matchAll(/\[FIRM_DATA:\s*([a-zA-Z_]+)\s*\|/gi))].map(m => m[1]))];
      const savedData = preCheck.firmData instanceof Map ? preCheck.firmData : new Map(Object.entries(preCheck.firmData || {}));
      const unfilled = allPlaceholderKeys.filter(k => !savedData.has(k));
      if (unfilled.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot publish: ${unfilled.length} unfilled placeholder(s) remain`,
          unfilledKeys: unfilled,
        });
      }
    }

    const result = await firmApproveAndExecute(req.params.id, req.vendorId.toString(), { qualifiedPersonConfirmation });

    if (!result.ok) {
      if (result.firmRetriable) {
        return res.status(422).json({
          success: false,
          error: result.error,
          firmRetriable: true,
        });
      }
      return res.status(422).json({
        success: false,
        error: `Draft could not be published: ${result.error}. It has been sent back to admin for review.`,
        routedToReview: true,
      });
    }

    const item = result.item;
    let liveUrl = null;
    if (item.itemType === 'content_draft' && item.executionResult?.slug) {
      liveUrl = `https://www.tendorai.com/posts/${item.executionResult.slug}`;
      item.liveUrl = liveUrl;
      await item.save();
      pingBingIndexNow([liveUrl]).then(r => {
        if (r.ok) console.log(`[IndexNow] Pinged for ${liveUrl}`);
      });
    }

    res.json({ success: true, status: item.status, liveUrl });
  } catch (err) {
    console.error('[firm-approve] error:', err);
    const status = err.code === 'NOMINATED_APPROVER_REQUIRED' ? 422
      : err.code === 'QUALIFIED_PERSON_CONFIRMATION_REQUIRED' ? 400
      : err.message.includes('not found') ? 404
      : err.message.includes('Access denied') ? 403
      : err.message.includes('Cannot') || err.message.includes('must be') ? 400
      : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// POST /api/vendor/approvals/:id/firm-reject — firm rejects with required comment
router.post('/:id/firm-reject', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'A rejection comment is required' });
    }

    const item = await firmRejectItem(req.params.id, req.vendorId.toString(), reason);
    console.log(`[FIRM ACTION] draft_rejected id=${item._id} by=vendor:${req.vendorId} reason="${reason.substring(0, 100)}"`);
    res.json({ success: true, status: item.status });
  } catch (err) {
    console.error('[firm-reject] error:', err);
    const status = err.message.includes('not found') ? 404
      : err.message.includes('Access denied') ? 403
      : err.message.includes('Cannot') || err.message.includes('must be') ? 400
      : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// POST /api/vendor/approvals/:id/firm-republish — update published post with new firm values
router.post('/:id/firm-republish', async (req, res) => {
  try {
    const result = await firmRepublish(req.params.id, req.vendorId.toString());
    console.log(`[FIRM ACTION] draft_republished id=${req.params.id} postId=${result.postId} by=vendor:${req.vendorId}`);
    res.json({ success: true, postId: result.postId, slug: result.slug, updatedAt: result.updatedAt });
  } catch (err) {
    console.error('[firm-republish] error:', err);
    if (err.message.includes('Publish blocked') || err.message.includes('Validation failed') || err.message.includes('Semantic review')) {
      return res.status(422).json({ success: false, error: err.message });
    }
    const status = err.message.includes('not found') ? 404
      : err.message.includes('Access denied') ? 403
      : err.message.includes('Cannot') || err.message.includes('must be') ? 400
      : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

export default router;
