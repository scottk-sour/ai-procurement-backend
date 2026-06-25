import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import WeeklyReport from '../models/WeeklyReport.js';
import AgentRun from '../models/AgentRun.js';
import AIMentionScan from '../models/AIMentionScan.js';
import { getBrowsingFilter } from '../lib/data/vendorMentions.js';
import DirectoryListing from '../models/DirectoryListing.js';

const router = express.Router();

router.use(vendorAuth);

function normaliseWeek(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return AgentRun.normaliseWeekStarting(d);
}

// GET /api/vendor/weekly-report/list
router.get('/list', async (req, res) => {
  try {
    const reports = await WeeklyReport.find({ vendorId: req.vendorId })
      .sort({ weekStarting: -1 })
      .limit(12)
      .select('weekStarting weekEnding digest.score digest.citations.total digest.agentActivity generatedAt')
      .lean();

    const items = reports.map(r => ({
      weekStarting: r.weekStarting.toISOString(),
      weekEnding: r.weekEnding.toISOString(),
      score: r.digest?.score?.current ?? null,
      citations: r.digest?.citations?.total ?? 0,
      fixesDeployed: (r.digest?.agentActivity?.listings?.submitted || 0) +
        (r.digest?.agentActivity?.writer?.draftsProduced || 0),
    }));

    res.json({ success: true, reports: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/weekly-report/next-week-plan
router.get('/next-week-plan', async (req, res) => {
  try {
    const { resolveNextTopic } = await import('../services/writerAgent.js');
    const { default: Vendor } = await import('../models/Vendor.js');

    const vendor = await Vendor.findById(req.vendorId)
      .select('vendorType practiceAreas')
      .lean();

    let plannedDrafts = [];
    if (vendor) {
      const lastWriterRun = await AgentRun.findOne({
        vendorId: req.vendorId,
        agentName: 'writer',
        status: 'completed',
      }).sort({ weekStarting: -1 }).lean();

      const lastPillar = lastWriterRun?.artifacts?.lastPillar ?? null;
      const lastTopicIndex = lastWriterRun?.artifacts?.lastTopicIndex ?? null;
      const next = resolveNextTopic(vendor.vendorType, lastPillar, lastTopicIndex);
      if (next && next.topic) {
        plannedDrafts = [{
          pillarId: next.pillarId,
          topicTitle: next.topic.title || 'Upcoming topic',
          scheduledFor: 'Next Monday 05:00 UTC',
        }];
      }
    }

    const plannedListings = await DirectoryListing.find({
      vendorId: req.vendorId,
      status: { $in: ['queued', 'pending_verification'] },
    }).select('directory status').lean();

    res.json({
      success: true,
      plannedDrafts,
      plannedListings: plannedListings.map(l => ({ directory: l.directory, status: l.status })),
      plannedTradePressPitches: [],
      plannedScans: { count: 6, scheduledFor: 'Next Sunday 03:00 UTC' },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/weekly-report/:weekStarting/score-history
router.get('/:weekStarting/score-history', async (req, res) => {
  try {
    const ws = normaliseWeek(req.params.weekStarting);
    if (!ws) return res.status(400).json({ success: false, error: 'Invalid weekStarting date' });

    const reports = await WeeklyReport.find({ vendorId: req.vendorId })
      .sort({ weekStarting: -1 })
      .limit(12)
      .select('weekStarting weekEnding digest.score.current')
      .lean();

    const history = reports.reverse().map(r => ({
      weekStarting: r.weekStarting.toISOString(),
      weekEnding: r.weekEnding.toISOString(),
      score: r.digest?.score?.current ?? null,
    }));

    const first = reports.length > 0 ? reports[0] : null; // oldest, after .reverse(); earliest Pro score on file

    res.json({
      success: true,
      history,
      joinedScore: first?.digest?.score?.current ?? null,
      joinedAt: first?.weekStarting?.toISOString() ?? null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/weekly-report/:weekStarting/citations
router.get('/:weekStarting/citations', async (req, res) => {
  try {
    const ws = normaliseWeek(req.params.weekStarting);
    if (!ws) return res.status(400).json({ success: false, error: 'Invalid weekStarting date' });

    const report = await WeeklyReport.findOne({ vendorId: req.vendorId, weekStarting: ws }).lean();

    if (report && report.digest?.citations?.captured) {
      return res.json({ success: true, citations: report.digest.citations.captured });
    }

    const weekEnd = new Date(ws);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const scans = await AIMentionScan.find({
      vendorId: req.vendorId,
      scanDate: { $gte: ws, $lte: weekEnd },
      mentioned: true,
      ...getBrowsingFilter(),
    }).lean();

    const citations = scans.map(s => ({
      platform: s.platform === 'metaai' ? 'meta_ai' : s.platform,
      query: s.prompt || '',
      position: s.position || 'mentioned',
      snippet: s.responseSnippet || null,
      capturedAt: s.scanDate,
      screenshotUrl: null,
    }));

    res.json({ success: true, citations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/weekly-report/:weekStarting/findings
router.get('/:weekStarting/findings', async (req, res) => {
  try {
    const ws = normaliseWeek(req.params.weekStarting);
    if (!ws) return res.status(400).json({ success: false, error: 'Invalid weekStarting date' });

    const report = await WeeklyReport.findOne({ vendorId: req.vendorId, weekStarting: ws }).lean();
    const detectiveFindings = report?.digest?.agentActivity?.detective;

    if (!detectiveFindings || !detectiveFindings.ran) {
      return res.json({ success: true, findings: [] });
    }

    const agentRun = await AgentRun.findOne({
      vendorId: req.vendorId,
      agentName: 'detective',
      weekStarting: ws,
      status: { $in: ['completed', 'partial'] },
    }).lean();

    const findings = (agentRun?.artifacts?.findings || []).map(f => ({
      type: f.type || '',
      severity: f.severity || '',
      title: f.title || '',
      detail: f.detail || '',
      recommendation: f.recommendation || '',
      capturedAt: agentRun.completedAt || agentRun.createdAt || ws,
      status: 'identified',
      relatedActions: [],
    }));

    const subsequentRuns = await AgentRun.find({
      vendorId: req.vendorId,
      weekStarting: ws,
      agentName: { $in: ['writer', 'listings'] },
      status: { $in: ['completed', 'partial'] },
    }).select('agentName status completedAt').lean();

    if (subsequentRuns.length > 0 && findings.length > 0) {
      for (const run of subsequentRuns) {
        findings[0].relatedActions.push({
          type: run.agentName === 'writer' ? 'content_draft' : 'directory_submission',
          agentName: run.agentName,
          status: run.status,
          executedAt: run.completedAt || null,
        });
      }
    }

    res.json({ success: true, findings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/weekly-report/:weekStarting/competitor-moves
router.get('/:weekStarting/competitor-moves', async (req, res) => {
  try {
    const ws = normaliseWeek(req.params.weekStarting);
    if (!ws) return res.status(400).json({ success: false, error: 'Invalid weekStarting date' });

    const report = await WeeklyReport.findOne({ vendorId: req.vendorId, weekStarting: ws }).lean();
    const moves = report?.digest?.competitorMoves || [];

    const competitorCounts = {};
    for (const m of moves) {
      competitorCounts[m.competitor] = (competitorCounts[m.competitor] || 0) + 1;
    }

    const topCompetitors = Object.entries(competitorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, citationCount]) => ({ name, citationCount }));

    res.json({
      success: true,
      moves: moves.map(m => ({
        platform: m.platform,
        query: m.query,
        competitorName: m.competitor,
        competitorPosition: 'mentioned',
        capturedAt: m.capturedAt,
        vendorMissedReason: 'not_mentioned_in_response',
      })),
      summary: {
        totalCompetitorWins: moves.length,
        topCompetitors,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendor/weekly-report/:weekStarting
router.get('/:weekStarting', async (req, res) => {
  try {
    const ws = normaliseWeek(req.params.weekStarting);
    if (!ws) return res.status(400).json({ success: false, error: 'Invalid weekStarting date' });

    const report = await WeeklyReport.findOne({ vendorId: req.vendorId, weekStarting: ws });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'No weekly report found for this week. Reports are generated every Monday at 08:00 UTC.',
      });
    }

    res.json({ success: true, report: report.toClientJSON() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
