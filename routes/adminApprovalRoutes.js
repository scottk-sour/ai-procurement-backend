import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import {
  approveItem,
  rejectItem,
  executeApprovedItem,
  listPending,
  getApprovalById,
} from '../services/approvalQueue.js';

const router = express.Router();

router.use(adminAuth);

// GET /api/admin/approvals
router.get('/', async (req, res) => {
  try {
    const { status, agentName, itemType, vendorId, page, limit } = req.query;
    const result = await listPending({
      status: status || undefined,
      agentName: agentName || undefined,
      itemType: itemType || undefined,
      vendorId: vendorId || undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/approvals/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await getApprovalById(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Approval item not found' });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/approvals/:id/approve
router.post('/:id/approve', async (req, res) => {
  try {
    const item = await approveItem(req.params.id, req.admin?.id || req.admin?.userId, req.body.reason);
    console.log(`[ADMIN ACTION] approval_approved id=${item._id} agent=${item.agentName} type=${item.itemType} by=${req.admin?.email}`);
    res.json({ success: true, item });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : err.message.includes('Cannot') ? 409 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// POST /api/admin/approvals/:id/reject
router.post('/:id/reject', async (req, res) => {
  try {
    if (!req.body.reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }
    const item = await rejectItem(req.params.id, req.admin?.id || req.admin?.userId, req.body.reason);
    console.log(`[ADMIN ACTION] approval_rejected id=${item._id} agent=${item.agentName} type=${item.itemType} by=${req.admin?.email} reason="${item.decisionReason}"`);
    res.json({ success: true, item });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : err.message.includes('Cannot') ? 409 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// POST /api/admin/approvals/:id/execute
router.post('/:id/execute', async (req, res) => {
  try {
    const item = await executeApprovedItem(req.params.id);
    console.log(`[ADMIN ACTION] approval_executed id=${item._id} agent=${item.agentName} type=${item.itemType} by=${req.admin?.email}`);
    res.json({ success: true, item });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : err.message.includes('must be') ? 409 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

export default router;
