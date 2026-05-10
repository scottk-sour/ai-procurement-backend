import Vendor from '../models/Vendor.js';
import AeoReport from '../models/AeoReport.js';
import AIMentionScan from '../models/AIMentionScan.js';
import AgentRun from '../models/AgentRun.js';
import DirectoryListing from '../models/DirectoryListing.js';
import ApprovalQueue from '../models/ApprovalQueue.js';

const PRO_TIERS = ['pro', 'managed', 'verified', 'enterprise'];
const PRO_ACCOUNT_TIERS = ['gold', 'platinum', 'pro', 'verified'];

function weekEnd(weekStarting) {
  const end = new Date(weekStarting);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function previousWeekStart(weekStarting) {
  const prev = new Date(weekStarting);
  prev.setUTCDate(prev.getUTCDate() - 7);
  return prev;
}

function parseFirstName(vendor) {
  const raw = vendor.name || vendor.contactInfo?.name || null;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || /^(admin|reception|info|office|accounts|enquiries)/i.test(trimmed)) return null;
  return trimmed.split(/\s+/)[0];
}

async function buildScoreSection(vendorId, weekStarting) {
  try {
    const reports = await AeoReport.find({ vendorId })
      .sort({ createdAt: -1 })
      .select('score createdAt')
      .limit(50)
      .lean();

    if (!reports.length) {
      return { current: null, previous: null, delta: null, history: [] };
    }

    const byWeek = new Map();
    for (const r of reports) {
      if (r.score == null) continue;
      const ws = AgentRun.normaliseWeekStarting(r.createdAt).toISOString();
      if (!byWeek.has(ws)) byWeek.set(ws, { date: r.createdAt, score: r.score });
    }

    const thisWeekKey = weekStarting.toISOString();
    const prevWeekKey = previousWeekStart(weekStarting).toISOString();

    const current = byWeek.get(thisWeekKey)?.score ?? null;
    const previous = byWeek.get(prevWeekKey)?.score ?? null;
    const delta = (current != null && previous != null) ? current - previous : null;

    const history = [...byWeek.values()]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-12)
      .map(h => ({ date: h.date, score: h.score }));

    return { current, previous, delta, history };
  } catch {
    return { current: null, previous: null, delta: null, history: [] };
  }
}

async function buildCitationsSection(vendorId, weekStarting, ending) {
  try {
    const scans = await AIMentionScan.find({
      vendorId,
      scanDate: { $gte: weekStarting, $lte: ending },
    }).lean();

    const platforms = ['chatgpt', 'perplexity', 'claude', 'gemini', 'grok', 'metaai'];
    const byPlatform = {};
    for (const p of platforms) {
      const key = p === 'metaai' ? 'meta_ai' : p;
      const platformScans = scans.filter(s => s.platform === p);
      const mentioned = platformScans.filter(s => s.mentioned).length;
      byPlatform[key] = { mentioned, target: platformScans.length, change: 0 };
    }

    const total = scans.filter(s => s.mentioned).length;

    const captured = scans
      .filter(s => s.mentioned)
      .map(s => ({
        platform: s.platform === 'metaai' ? 'meta_ai' : s.platform,
        query: s.prompt || '',
        position: s.position || 'mentioned',
        snippet: s.responseSnippet || null,
        capturedAt: s.scanDate,
      }));

    return { total, byPlatform, captured };
  } catch {
    return {
      total: 0,
      byPlatform: {
        chatgpt: { mentioned: 0, target: 0, change: 0 },
        perplexity: { mentioned: 0, target: 0, change: 0 },
        claude: { mentioned: 0, target: 0, change: 0 },
        gemini: { mentioned: 0, target: 0, change: 0 },
        grok: { mentioned: 0, target: 0, change: 0 },
        meta_ai: { mentioned: 0, target: 0, change: 0 },
      },
      captured: [],
    };
  }
}

async function buildAgentActivity(vendorId, weekStarting) {
  const result = {
    writer: { ran: false, draftsProduced: 0, draftTitles: [], pendingApproval: 0 },
    detective: { ran: false, findingsCount: 0, topFinding: null },
    listings: { ran: false, submitted: 0, live: 0, pending: 0, directories: [] },
    reviews: { ran: false, sent: 0, skipped: { optedOut: 0, cooldown: 0, alreadyReviewed: 0 } },
    reconnaissance: { ran: false, queriesScanned: 0, platformsScanned: 0 },
  };

  try {
    const runs = await AgentRun.find({ vendorId, weekStarting }).lean();
    const runMap = {};
    for (const r of runs) runMap[r.agentName] = r;

    const writerRun = runMap.writer;
    if (writerRun && (writerRun.status === 'completed' || writerRun.status === 'partial')) {
      result.writer.ran = true;
      result.writer.draftsProduced = writerRun.artifacts?.postsDrafted || 0;
      if (writerRun.artifacts?.draftTitle) {
        result.writer.draftTitles = [writerRun.artifacts.draftTitle];
      }
    }

    try {
      result.writer.pendingApproval = await ApprovalQueue.countDocuments({
        vendorId,
        status: 'pending',
      });
    } catch { /* ignore */ }

    const detectiveRun = runMap.detective;
    if (detectiveRun && (detectiveRun.status === 'completed' || detectiveRun.status === 'partial')) {
      result.detective.ran = true;
      const findings = detectiveRun.artifacts?.findings || [];
      result.detective.findingsCount = findings.length;
      if (findings.length > 0 && findings[0]) {
        const top = findings[0];
        const fullEvidence = top.evidence || '';
        const firstSentence = fullEvidence.split(/[.!?]/)[0]?.trim();
        result.detective.topFinding = {
          type: top.category || '',
          severity: top.severity || '',
          title: firstSentence || fullEvidence,
          detail: fullEvidence,
          recommendation: top.recommendation || '',
        };
      }
    }

    const listingsRun = runMap.listings;
    if (listingsRun && (listingsRun.status === 'completed' || listingsRun.status === 'partial')) {
      result.listings.ran = true;
      result.listings.submitted = listingsRun.artifacts?.submitted || 0;
    }

    try {
      const listings = await DirectoryListing.find({ vendorId }).lean();
      result.listings.live = listings.filter(l => l.status === 'live').length;
      result.listings.pending = listings.filter(l =>
        ['queued', 'submitted', 'pending_verification'].includes(l.status)
      ).length;
      result.listings.directories = listings.map(l => ({
        directory: l.directory,
        status: l.status,
      }));
    } catch { /* ignore */ }

    const reviewsRun = runMap.reviews;
    if (reviewsRun && (reviewsRun.status === 'completed' || reviewsRun.status === 'partial')) {
      result.reviews.ran = true;
      result.reviews.sent = reviewsRun.artifacts?.sent || 0;
      const skipped = reviewsRun.artifacts?.skipped || {};
      result.reviews.skipped = {
        optedOut: skipped.optedOut || 0,
        cooldown: skipped.cooldown || 0,
        alreadyReviewed: skipped.alreadyReviewed || 0,
      };
    }

    const reconRun = runMap.reconnaissance;
    if (reconRun && (reconRun.status === 'completed' || reconRun.status === 'partial')) {
      result.reconnaissance.ran = true;
      result.reconnaissance.queriesScanned = reconRun.artifacts?.platformsQueried || 0;
      result.reconnaissance.platformsScanned = reconRun.artifacts?.platformsQueried || 0;
    }
  } catch { /* ignore — return defaults */ }

  return result;
}

async function buildNeedsAttention(vendorId) {
  try {
    const pending = await ApprovalQueue.find({ vendorId, status: 'pending' })
      .select('itemType title')
      .lean();

    return pending.map(item => ({
      type: item.itemType === 'content_draft' ? 'draft_approval' : item.itemType,
      title: item.title || 'Pending item',
      href: '/vendor-dashboard/approvals',
    }));
  } catch {
    return [];
  }
}

async function buildCompetitorMoves(vendorId, weekStarting, ending) {
  try {
    const scans = await AIMentionScan.find({
      vendorId,
      scanDate: { $gte: weekStarting, $lte: ending },
      mentioned: false,
    }).lean();

    const moves = [];
    for (const scan of scans) {
      for (const comp of (scan.competitorsMentioned || [])) {
        moves.push({
          platform: scan.platform === 'metaai' ? 'meta_ai' : scan.platform,
          query: scan.prompt || '',
          competitor: comp,
          capturedAt: scan.scanDate,
        });
      }
    }
    return moves;
  } catch {
    return [];
  }
}

export async function buildWeeklyProDigest(vendorId, weekStarting = null) {
  const ws = weekStarting
    ? AgentRun.normaliseWeekStarting(weekStarting)
    : AgentRun.normaliseWeekStarting(new Date());
  const ending = weekEnd(ws);

  const vendor = await Vendor.findById(vendorId)
    .select('_id company name vendorType tier contactInfo')
    .lean();

  if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

  const [score, citations, agentActivity, needsAttention, competitorMoves] = await Promise.all([
    buildScoreSection(vendorId, ws),
    buildCitationsSection(vendorId, ws, ending),
    buildAgentActivity(vendorId, ws),
    buildNeedsAttention(vendorId),
    buildCompetitorMoves(vendorId, ws, ending),
  ]);

  return {
    vendor: {
      id: String(vendor._id),
      firmName: vendor.company || 'Unknown Firm',
      firstName: parseFirstName(vendor),
      vendorType: vendor.vendorType || 'unknown',
      tier: vendor.tier || 'free',
    },
    weekStarting: ws,
    weekEnding: ending,
    score,
    citations,
    agentActivity,
    needsAttention,
    competitorMoves,
    nextWeekPlan: null,
    generatedAt: new Date(),
  };
}

export async function buildWeeklyProDigestForAllVendors(weekStarting = null) {
  const vendors = await Vendor.find({
    $or: [
      { tier: { $in: PRO_TIERS } },
      { 'account.tier': { $in: PRO_ACCOUNT_TIERS } },
    ],
  }).select('_id company email').lean();

  const results = [];
  for (const vendor of vendors) {
    try {
      const digest = await buildWeeklyProDigest(vendor._id, weekStarting);
      results.push({ vendorId: String(vendor._id), email: vendor.email, digest });
    } catch (err) {
      results.push({ vendorId: String(vendor._id), email: vendor.email, digest: null, error: err.message });
    }
  }
  return results;
}
