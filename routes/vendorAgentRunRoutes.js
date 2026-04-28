import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import AgentRun from '../models/AgentRun.js';

const router = express.Router();

router.use(vendorAuth);

// GET /api/vendor/agent-runs/current-week
router.get('/current-week', async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const weekStarting = AgentRun.normaliseWeekStarting(new Date());

    const runs = await AgentRun.find({ vendorId, weekStarting })
      .sort({ agentName: 1 })
      .populate('relatedApprovalIds', 'title status itemType')
      .lean();

    res.json({ success: true, weekStarting, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/agent-runs/history?weeks=8
router.get('/history', async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const weeksCount = Math.min(Math.max(parseInt(req.query.weeks) || 8, 1), 52);

    const now = new Date();
    const currentMonday = AgentRun.normaliseWeekStarting(now);

    const oldestMonday = new Date(currentMonday);
    oldestMonday.setUTCDate(oldestMonday.getUTCDate() - (weeksCount - 1) * 7);

    const runs = await AgentRun.find({
      vendorId,
      weekStarting: { $gte: oldestMonday, $lte: currentMonday },
    })
      .sort({ weekStarting: -1, agentName: 1 })
      .populate('relatedApprovalIds', 'title status itemType')
      .lean();

    const weekMap = new Map();
    for (let i = 0; i < weeksCount; i++) {
      const monday = new Date(currentMonday);
      monday.setUTCDate(monday.getUTCDate() - i * 7);
      weekMap.set(monday.toISOString(), { weekStarting: monday, runs: [] });
    }

    for (const run of runs) {
      const key = run.weekStarting.toISOString();
      if (weekMap.has(key)) {
        weekMap.get(key).runs.push(run);
      }
    }

    const weeks = Array.from(weekMap.values());

    res.json({ success: true, weeks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/agent-runs/week/:weekStarting
router.get('/week/:weekStarting', async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const weekStarting = AgentRun.normaliseWeekStarting(new Date(req.params.weekStarting));

    const runs = await AgentRun.find({ vendorId, weekStarting })
      .sort({ agentName: 1 })
      .populate('relatedApprovalIds', 'title status itemType')
      .lean();

    res.json({ success: true, weekStarting, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
