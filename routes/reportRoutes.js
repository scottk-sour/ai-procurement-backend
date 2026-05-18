import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import adminAuth from '../middleware/adminAuth.js';
import WeeklyReport from '../models/WeeklyReport.js';

const router = express.Router();

// GET /api/vendor/reports/:reportId — vendor fetches own report
router.get('/:reportId', vendorAuth, async (req, res) => {
  try {
    const report = await WeeklyReport.findOne({
      _id: req.params.reportId,
      vendorId: req.vendorId,
    });

    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    if (!report.firstViewedAt) {
      report.firstViewedAt = new Date();
      report.status = 'viewed';
      await report.save();
    }

    res.json({ success: true, report: report.toClientJSON() });
  } catch (err) {
    console.error('Report fetch error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
});

// GET /api/vendor/reports — vendor lists own reports
router.get('/', vendorAuth, async (req, res) => {
  try {
    const reports = await WeeklyReport.find({ vendorId: req.vendorId })
      .sort({ weekStartDate: -1 })
      .limit(20)
      .select('reportNumber weekStartDate weekEndDate scoreHeader.currentScore scoreHeader.weeklyChange scoreHeader.competitorsAhead status firstViewedAt generatedAt')
      .lean();

    res.json({ success: true, reports });
  } catch (err) {
    console.error('Reports list error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
});

// GET /api/admin/reports/:vendorId/:reportId/synthetic — admin-only synthetic flags
router.get('/admin/:vendorId/:reportId/synthetic', adminAuth, async (req, res) => {
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
