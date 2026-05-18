import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import WeeklyReport from '../models/WeeklyReport.js';

const router = express.Router({ mergeParams: true });

// GET /api/admin/vendors/:vendorId/reports/:reportId/synthetic
router.get('/:reportId/synthetic', adminAuth, async (req, res) => {
  try {
    const report = await WeeklyReport.findOne({
      _id: req.params.reportId,
      vendorId: req.params.vendorId,
    }).select('syntheticDataFlags reportNumber').lean();

    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, reportNumber: report.reportNumber, syntheticDataFlags: report.syntheticDataFlags || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
