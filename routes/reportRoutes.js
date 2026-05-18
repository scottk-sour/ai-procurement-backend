import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import WeeklyReport from '../models/WeeklyReport.js';

const router = express.Router({ mergeParams: true });

function checkVendorMatch(req, res) {
  const urlVendorId = req.params.vendorId;
  const tokenVendorId = req.vendorId?.toString();
  if (urlVendorId !== tokenVendorId) {
    res.status(403).json({ success: false, error: 'Cannot access another vendor\'s reports' });
    return false;
  }
  return true;
}

// GET /api/vendors/:vendorId/reports — vendor lists own reports
router.get('/', vendorAuth, async (req, res) => {
  if (!checkVendorMatch(req, res)) return;
  try {
    const reports = await WeeklyReport.find({ vendorId: req.params.vendorId })
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

// GET /api/vendors/:vendorId/reports/:reportId — vendor fetches single report
router.get('/:reportId', vendorAuth, async (req, res) => {
  if (!checkVendorMatch(req, res)) return;
  try {
    const report = await WeeklyReport.findOne({
      _id: req.params.reportId,
      vendorId: req.params.vendorId,
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

export default router;
