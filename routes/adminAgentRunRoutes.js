import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import AgentRun from '../models/AgentRun.js';
import {
  getRunById,
  getRunsByVendor,
  getWeeklyRuns,
} from '../services/agentRun.js';

const router = express.Router();

router.use(adminAuth);

// GET /api/admin/agent-runs/health — cross-customer status summary for current week
router.get('/health', async (req, res) => {
  try {
    const weekStarting = AgentRun.normaliseWeekStarting(new Date());
    const pipeline = [
      { $match: { weekStarting } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ];
    const groups = await AgentRun.aggregate(pipeline);

    const summary = { weekStarting, pending: 0, running: 0, completed: 0, failed: 0, partial: 0, total: 0 };
    for (const g of groups) {
      summary[g._id] = g.count;
      summary.total += g.count;
    }

    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/agent-runs/by-vendor/:vendorId/week/:weekStarting
router.get('/by-vendor/:vendorId/week/:weekStarting', async (req, res) => {
  try {
    const { vendorId, weekStarting } = req.params;
    const runs = await getWeeklyRuns(vendorId, new Date(weekStarting));
    res.json({ success: true, runs, count: runs.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/agent-runs/:id — single run with full artifacts
router.get('/:id', async (req, res) => {
  try {
    const run = await getRunById(req.params.id);
    if (!run) return res.status(404).json({ success: false, error: 'Agent run not found' });
    res.json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/agent-runs — list with filters
router.get('/', async (req, res) => {
  try {
    const { vendorId, agentName, status, weekStarting, page, limit } = req.query;

    const filter = {};
    if (vendorId) filter.vendorId = vendorId;
    if (agentName) filter.agentName = agentName;
    if (status) filter.status = status;
    if (weekStarting) filter.weekStarting = AgentRun.normaliseWeekStarting(new Date(weekStarting));

    const skip = ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20);
    const lim = parseInt(limit) || 20;

    const [items, total] = await Promise.all([
      AgentRun.find(filter)
        .sort({ weekStarting: -1, agentName: 1 })
        .skip(skip)
        .limit(lim)
        .populate('vendorId', 'company email tier')
        .lean(),
      AgentRun.countDocuments(filter),
    ]);

    res.json({
      success: true,
      items,
      pagination: { page: parseInt(page) || 1, limit: lim, total, pages: Math.ceil(total / lim) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
