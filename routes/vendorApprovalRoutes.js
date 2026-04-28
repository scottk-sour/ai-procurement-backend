import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import ApprovalQueue from '../models/ApprovalQueue.js';

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

export default router;
