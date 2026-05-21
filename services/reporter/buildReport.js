import WeeklyReport from '../../models/WeeklyReport.js';
import Vendor from '../../models/Vendor.js';
import AgentRun from '../../models/AgentRun.js';
import ApprovalQueue from '../../models/ApprovalQueue.js';
import AIMentionScan from '../../models/AIMentionScan.js';
import { titleCaseCompanyName } from './textFormatters.js';

function slugifyUpper(text) {
  return (text || 'UNKNOWN')
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function getYearWeek(date) {
  const d = new Date(date);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + yearStart.getDay() + 1) / 7);
  return { year: d.getFullYear(), week };
}

function endOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Check whether a vendor has had at least one real AI mention scan.
 * Returns { hasRealScans, scanCount }.
 */
export async function vendorHasRealScans(vendorId) {
  const count = await AIMentionScan.countDocuments({
    vendorId,
    $or: [{ status: 'ok' }, { status: { $exists: false } }],
  });
  return { hasRealScans: count > 0, scanCount: count };
}

export async function buildAIVisibilityIntelligenceReport(vendorId, weekStartDate) {
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  const weekEnd = endOfWeek(weekStartDate);

  const [reconRuns, pendingApprovals, priorReports] = await Promise.all([
    AgentRun.find({ vendorId, agentName: 'reconnaissance', weekStarting: { $gte: weekStartDate, $lte: weekEnd }, status: { $in: ['completed', 'partial'] } }).lean(),
    getDedupedPendingApprovals(vendorId),
    WeeklyReport.find({ vendorId, weekStartDate: { $lt: weekStartDate } }).sort({ weekStartDate: -1 }).limit(8).lean(),
  ]);

  // Real scan data for this week
  const weekScans = await AIMentionScan.find({
    vendorId,
    scanDate: { $gte: weekStartDate, $lte: weekEnd },
    $or: [{ status: 'ok' }, { status: { $exists: false } }],
  }).lean();

  // SECTION 1: Score header — built from real recon data only
  const previousScore = priorReports[0]?.scoreHeader?.currentScore ?? null;
  const currentScore = computeVisibilityScore(reconRuns);
  const sparkline = buildSparkline(priorReports, currentScore);

  const scoreHeader = {
    currentScore,
    previousScore,
    weeklyChange: previousScore != null ? currentScore - previousScore : 0,
    trendSparkline: sparkline,
  };

  // SECTION 2: Share of voice — from real scan data
  const shareOfVoice = buildShareOfVoice(weekScans);

  // SECTION 3: Who AI recommended instead — from real competitorsMentioned data
  const { competitors: realCompetitors, competitorHeadline } = buildRealCompetitors(weekScans, vendor);

  // SECTION 4: Prompt analysis — from real scan prompts and results
  const promptAnalysis = buildRealPromptAnalysis(weekScans, vendor);

  // SECTION 5: Recommended actions — real pending approvals
  const recommendedActions = pendingApprovals.map(a => ({
    title: a.title || a.itemType,
    description: a.draftPayload?.description || '',
    estimatedImpact: estimateActionImpact(a),
    severity: estimateActionImpact(a) >= 6 ? 'high' : estimateActionImpact(a) >= 4 ? 'medium' : 'low',
    approvalId: a._id,
  })).sort((a, b) => b.estimatedImpact - a.estimatedImpact);

  // SECTION 6: What's next
  const whatsNext = buildWhatsNext(weekEnd);

  // Board summary — plain factual, no LLM call for fabricated narrative
  const mentionedPlatforms = [...new Set(weekScans.filter(s => s.mentioned === true).map(s => s.platform).filter(Boolean))];
  const totalPrompts = weekScans.length;
  const totalMentions = weekScans.filter(s => s.mentioned === true).length;

  let boardSummary;
  if (totalPrompts === 0) {
    boardSummary = `No AI visibility scans completed this week. Your first scan data will appear in next week's report.`;
  } else if (totalMentions === 0) {
    boardSummary = `AI assistants did not mention ${vendor.company} for any of the ${totalPrompts} prompts tested this week. ${recommendedActions.length > 0 ? `${recommendedActions.length} fix${recommendedActions.length === 1 ? '' : 'es'} prepared and pending your approval.` : 'Building your visibility profile — recommendations coming soon.'}`;
  } else {
    boardSummary = `${vendor.company} was mentioned in ${totalMentions} of ${totalPrompts} AI responses this week${mentionedPlatforms.length > 0 ? ` (${mentionedPlatforms.join(', ')})` : ''}. Score: ${currentScore}/100.${recommendedActions.length > 0 ? ` ${recommendedActions.length} fix${recommendedActions.length === 1 ? '' : 'es'} pending your approval.` : ''}`;
  }

  const yw = getYearWeek(weekStartDate);
  const reportNumber = `AVI-${slugifyUpper(vendor.company)}-${yw.year}-W${yw.week}`;

  return WeeklyReport.create({
    vendorId,
    weekStartDate,
    weekEndDate: weekEnd,
    reportNumber,
    scoreHeader,
    boardSummary,
    shareOfVoice,
    competitors: realCompetitors,
    competitorHeadline,
    promptAnalysis,
    recommendedActions,
    whatsNext,
    syntheticDataFlags: [],
  });
}

function computeVisibilityScore(reconRuns) {
  const mentions = reconRuns.reduce((sum, r) => sum + (r.artifacts?.mentionsFound || 0), 0);
  return Math.min(100, mentions * 8 + 12);
}

function buildSparkline(priorReports, currentScore) {
  const historical = priorReports.map(r => r.scoreHeader?.currentScore ?? null).reverse();
  return [...historical.slice(-7), currentScore];
}

function buildShareOfVoice(weekScans) {
  const platforms = [
    { key: 'claude', label: 'Anthropic Claude' },
    { key: 'chatgpt', label: 'ChatGPT (via OpenAI)' },
    { key: 'perplexity', label: 'Perplexity' },
    { key: 'gemini', label: 'Google Gemini' },
    { key: 'grok', label: 'xAI Grok' },
    { key: 'metaai', label: 'Meta AI' },
  ];

  return platforms.map(p => {
    const platformScans = weekScans.filter(s => s.platform === p.key);
    const mentioned = platformScans.filter(s => s.mentioned === true).length;
    const total = platformScans.length;
    return {
      platform: p.label,
      scanned: total,
      mentioned,
      mentionRate: total > 0 ? Math.round((mentioned / total) * 100) : null,
    };
  });
}

/**
 * Build the "Who AI recommended instead" section from real scan data.
 * Aggregates competitorsMentioned across all scans for this week.
 */
function buildRealCompetitors(weekScans, vendor) {
  const competitorCounts = {};
  const competitorPlatforms = {};

  for (const scan of weekScans) {
    for (const name of (scan.competitorsMentioned || [])) {
      competitorCounts[name] = (competitorCounts[name] || 0) + 1;
      if (!competitorPlatforms[name]) competitorPlatforms[name] = new Set();
      if (scan.platform) competitorPlatforms[name].add(scan.platform);
    }
  }

  const sorted = Object.entries(competitorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const totalPrompts = weekScans.length;
  const yourMentions = weekScans.filter(s => s.mentioned === true).length;

  const competitors = sorted.map(([name, citationCount]) => ({
    firmName: titleCaseCompanyName(name),
    citationCount,
    platforms: [...(competitorPlatforms[name] || [])],
    isYou: false,
  }));

  competitors.push({
    firmName: vendor.company,
    citationCount: yourMentions,
    platforms: [...new Set(weekScans.filter(s => s.mentioned === true).map(s => s.platform).filter(Boolean))],
    isYou: true,
  });

  competitors.sort((a, b) => b.citationCount - a.citationCount);

  let competitorHeadline;
  const topNonYou = competitors.find(c => !c.isYou);
  if (!topNonYou) {
    competitorHeadline = weekScans.length > 0
      ? `No competitor firms were named in AI responses for ${vendor.vendorType} queries in ${vendor.location?.city || 'your area'} this week.`
      : `No scan data available this week.`;
  } else if (topNonYou.citationCount > yourMentions) {
    competitorHeadline = `${topNonYou.firmName} was cited ${topNonYou.citationCount} time${topNonYou.citationCount === 1 ? '' : 's'} across ${topNonYou.platforms.length} platform${topNonYou.platforms.length === 1 ? '' : 's'} this week. ${vendor.company} was cited ${yourMentions} time${yourMentions === 1 ? '' : 's'}.`;
  } else {
    competitorHeadline = `${vendor.company} was cited ${yourMentions} time${yourMentions === 1 ? '' : 's'} this week — ahead of all tracked competitors.`;
  }

  return { competitors, competitorHeadline };
}

/**
 * Build prompt analysis from REAL scan data.
 * Groups scans by prompt and shows which firms were actually cited.
 */
function buildRealPromptAnalysis(weekScans, vendor) {
  const byPrompt = {};
  for (const scan of weekScans) {
    const prompt = scan.prompt || 'Unknown prompt';
    if (!byPrompt[prompt]) byPrompt[prompt] = { mentioned: false, platforms: [], competitorsCited: [] };
    if (scan.mentioned === true) {
      byPrompt[prompt].mentioned = true;
      if (scan.platform) byPrompt[prompt].platforms.push(scan.platform);
    }
    for (const c of (scan.competitorsMentioned || [])) {
      if (!byPrompt[prompt].competitorsCited.includes(c)) {
        byPrompt[prompt].competitorsCited.push(c);
      }
    }
  }

  return Object.entries(byPrompt).map(([prompt, data]) => ({
    prompt,
    youCited: data.mentioned,
    platformsCited: [...new Set(data.platforms)],
    competitorsCited: data.competitorsCited.slice(0, 5).map(titleCaseCompanyName),
  }));
}

function estimateActionImpact(approval) {
  return { directory_submission: 5, content_draft: 7, schema_change: 4, review_request_batch: 3 }[approval.itemType] || 3;
}

function buildWhatsNext(weekEnd) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => {
    const date = new Date(weekEnd); date.setDate(date.getDate() + i + 1);
    return {
      dayLabel: `${d} ${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}`,
      eventLabel: i === 0 ? 'AI visibility scan' : i === 2 ? 'Content draft expected' : i === 3 ? 'Detective gap analysis' : i === 4 ? 'Content draft + directory audit' : 'AI visibility scan',
      vendorImpact: i === 2 || i === 4 ? 'Will appear in your approval queue' : i === 3 ? 'New fixes may be added to your queue' : 'Tracks score changes across live engines',
    };
  });
}

async function getDedupedPendingApprovals(vendorId) {
  const all = await ApprovalQueue.find({ vendorId, status: 'pending' }).lean();
  const seen = new Set();
  return all.filter(a => {
    const key = [a.itemType, String(a.vendorId), a.draftPayload?.directory || a.title || a._id].join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function linearProject(historical, weeksAhead) {
  const n = historical.length;
  if (n < 2) return Array(weeksAhead).fill(historical[n - 1] || 0);
  const sumX = (n * (n - 1)) / 2;
  const sumY = historical.reduce((a, b) => a + b, 0);
  const sumXY = historical.reduce((acc, y, x) => acc + x * y, 0);
  const sumX2 = historical.reduce((acc, _, x) => acc + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return Array.from({ length: weeksAhead }, (_, i) =>
    Math.max(0, Math.min(100, Math.round(intercept + slope * (n + i))))
  );
}
