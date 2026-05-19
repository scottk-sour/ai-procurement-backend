import WeeklyReport from '../../models/WeeklyReport.js';
import Vendor from '../../models/Vendor.js';
import AgentRun from '../../models/AgentRun.js';
import ApprovalQueue from '../../models/ApprovalQueue.js';
import * as synth from './syntheticDataEngine.js';
import { selectCompetitors } from './competitorSelector.js';
import { auditClaims } from './claimAccuracyAudit.js';
import { generateBoardSummary } from './boardSummaryPrompt.js';
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

export async function buildAIVisibilityIntelligenceReport(vendorId, weekStartDate) {
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  const weekEnd = endOfWeek(weekStartDate);
  const flags = [];

  const [reconRuns, completedActions, pendingApprovals, priorReports] = await Promise.all([
    AgentRun.find({ vendorId, agentName: 'reconnaissance', weekStarting: { $gte: weekStartDate, $lte: weekEnd }, status: { $in: ['completed', 'partial'] } }).lean(),
    ApprovalQueue.find({ vendorId, updatedAt: { $gte: weekStartDate, $lte: weekEnd }, status: 'approved' }).lean(),
    getDedupedPendingApprovals(vendorId),
    WeeklyReport.find({ vendorId, weekStartDate: { $lt: weekStartDate } }).sort({ weekStartDate: -1 }).limit(8).lean(),
  ]);

  const competitors = await selectCompetitors(vendor, 3);

  // SECTION 1: Score header
  const previousScore = priorReports[0]?.scoreHeader?.currentScore ?? null;
  const currentScore = computeVisibilityScore(reconRuns, vendor);
  const sparkline = buildSparkline(priorReports, currentScore);

  const benchmarkResult = synth.generateIndustryBenchmark(
    vendor.vendorType, vendor.location?.city, weekStartDate,
    await countVendorsInSegment(vendor)
  );
  if (benchmarkResult.isSynthetic) flags.push({ field: 'industryBenchmark', isSynthetic: true, method: benchmarkResult.method, replaceCondition: benchmarkResult.replaceCondition });

  const competitorScores = competitors.map(c => {
    const prior = priorReports[0]?.competitors?.find(pc => pc.firmName === c.company);
    const result = synth.generateCompetitorScore(c.company, weekStartDate, prior?.visibilityScore);
    if (result.isSynthetic) flags.push({ field: `competitor.${titleCaseCompanyName(c.company)}.score`, isSynthetic: true, method: result.method, replaceCondition: result.replaceCondition });
    return { competitor: c, ...result };
  });

  const competitorsAhead = competitorScores.filter(cs => cs.value > currentScore).length;

  const opportunityResult = synth.generateOpportunityLoss(
    vendor.vendorType, Math.max(0, 100 - currentScore), vendor.location?.city, weekStartDate
  );
  flags.push({ field: 'revenueExposure', isSynthetic: true, method: opportunityResult.method, replaceCondition: opportunityResult.replaceCondition });

  const scoreHeader = {
    currentScore,
    previousScore,
    weeklyChange: previousScore != null ? currentScore - previousScore : 0,
    rankInCity: competitorsAhead + 1,
    totalFirmsInCity: competitorScores.length + 1,
    competitorsAhead,
    monthlyOpportunityLoss: { min: opportunityResult.monthlyMin, max: opportunityResult.monthlyMax },
    trendSparkline: sparkline,
  };

  // SECTION 3: Share of voice
  const shareOfVoice = buildShareOfVoice(vendor, reconRuns, competitorScores);

  // SECTION 4: Competitor positioning
  const competitorList = [
    ...competitorScores.map(cs => ({
      firmName: titleCaseCompanyName(cs.competitor.company),
      visibilityScore: cs.value,
      weeklyChange: cs.weeklyChange,
      trendDirection: cs.trendDirection,
      isYou: false,
      citationCount: estimateCitationsFromScore(cs.value),
      notableMention: cs.value >= 30 ? `Cited in AI responses for ${vendor.vendorType} queries in ${vendor.location?.city}` : null,
    })),
    {
      firmName: vendor.company,
      visibilityScore: currentScore,
      weeklyChange: scoreHeader.weeklyChange,
      trendDirection: scoreHeader.weeklyChange > 0 ? 'up' : scoreHeader.weeklyChange < 0 ? 'down' : 'flat',
      isYou: true,
      citationCount: countRealMentions(reconRuns),
      notableMention: null,
    },
  ].sort((a, b) => b.visibilityScore - a.visibilityScore);

  const competitorHeadline = buildCompetitorHeadline(competitorList, vendor);

  // SECTION 5: Revenue exposure
  const revenueExposure = { monthlyMin: opportunityResult.monthlyMin, monthlyMax: opportunityResult.monthlyMax, methodology: opportunityResult.methodology };

  // SECTION 6: Prompt analysis
  const promptAnalysis = buildPromptAnalysis(vendor, competitors, weekStartDate);

  // SECTION 7: Authority graph
  const authorityGraph = buildAuthorityGraph(vendor);

  // SECTION 8: Perception + claim accuracy
  let inaccurateClaims = [];
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    inaccurateClaims = await auditClaims(vendor, anthropicClient, null);
  } catch (e) {
    console.error('[Reporter] Claim audit failed:', e.message);
  }
  const perceptionSynth = synth.generatePerception(vendor, weekStartDate);
  flags.push({ field: 'perception.associations', isSynthetic: true, method: perceptionSynth.method, replaceCondition: perceptionSynth.replaceCondition });

  const perceptionAnalysis = {
    positiveAssociations: perceptionSynth.positiveAssociations,
    missingAssociations: perceptionSynth.missingAssociations,
    competitorAssociations: perceptionSynth.competitorAssociations,
    inaccurateClaimsDetected: inaccurateClaims,
  };

  // SECTION 9: Projections
  const projectedScores = linearProject(sparkline, 4);
  const projections = { historicalScores: sparkline, projectedScores, projectionMethod: 'linear_regression_8week' };

  // SECTION 10: Opportunity feed
  const opportunityFeed = buildOpportunityFeed(vendor, weekStartDate, flags, competitorList);

  // SECTION 11: Recommended actions
  const recommendedActions = pendingApprovals.map(a => ({
    title: a.title || a.itemType,
    description: a.draftPayload?.description || '',
    estimatedImpact: estimateActionImpact(a),
    severity: estimateActionImpact(a) >= 6 ? 'high' : estimateActionImpact(a) >= 4 ? 'medium' : 'low',
    approvalId: a._id,
  })).sort((a, b) => b.estimatedImpact - a.estimatedImpact);

  // SECTION 12: What's next
  const whatsNext = buildWhatsNext(weekEnd);

  // SECTION 2: Board summary (generated last)
  let boardSummary;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    boardSummary = await generateBoardSummary(anthropicClient, { vendor, scoreHeader, competitorList, revenueExposure, recommendedActions });
  } catch (e) {
    console.error('[Reporter] Board summary failed:', e.message);
    boardSummary = `Your firm's AI market position report for this week is ready. TendorAI has prepared ${recommendedActions.length} fixes in your approval queue.`;
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
    competitors: competitorList,
    competitorHeadline,
    revenueExposure,
    promptAnalysis,
    authorityGraph,
    perceptionAnalysis,
    projections,
    opportunityFeed,
    recommendedActions,
    whatsNext,
    syntheticDataFlags: flags,
  });
}

function computeVisibilityScore(reconRuns, vendor) {
  const mentions = countRealMentions(reconRuns);
  return Math.min(100, mentions * 8 + 12);
}

function countRealMentions(reconRuns) {
  return reconRuns.reduce((sum, r) => sum + (r.artifacts?.mentionsFound || r.artifacts?.platformsQueried || 0), 0);
}

function buildSparkline(priorReports, currentScore) {
  const historical = priorReports.map(r => r.scoreHeader?.currentScore ?? 0).reverse();
  while (historical.length < 7) historical.unshift(Math.max(0, currentScore - 4));
  return [...historical.slice(-7), currentScore];
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

function buildShareOfVoice(vendor, reconRuns, competitorScores) {
  const yourMentions = countRealMentions(reconRuns);
  const competitorAvg = competitorScores.reduce((sum, cs) => sum + cs.value, 0) / Math.max(1, competitorScores.length);

  return [
    { platform: 'Anthropic Claude', platformStatus: 'live' },
    { platform: 'ChatGPT (via OpenAI)', platformStatus: 'live' },
    { platform: 'Perplexity', platformStatus: 'live' },
    { platform: 'Google Gemini', platformStatus: 'coming_q3_2026' },
    { platform: 'xAI Grok', platformStatus: 'coming_q3_2026' },
    { platform: 'DeepSeek', platformStatus: 'coming_q4_2026' },
  ].map(p => {
    if (p.platformStatus !== 'live') return { ...p, yourSharePercent: null, competitorAvgPercent: null, gap: null };
    const yourShare = Math.min(15, yourMentions * 2);
    const compShare = Math.round(competitorAvg / 4);
    return { ...p, yourSharePercent: yourShare, competitorAvgPercent: compShare, gap: compShare - yourShare };
  });
}

function buildCompetitorHeadline(list, vendor) {
  const you = list.find(c => c.isYou);
  const ahead = list.filter(c => !c.isYou && c.visibilityScore > you.visibilityScore);
  if (ahead.length === 0) return `${vendor.company} leads its tracked ${vendor.location?.city} competitors this week.`;
  return `${ahead[0].firmName} appeared in ${ahead[0].citationCount} AI-generated recommendations for ${vendor.vendorType} queries in ${vendor.location?.city} this week. ${vendor.company} appeared in ${you.citationCount}.`;
}

function estimateCitationsFromScore(score) {
  return Math.max(0, Math.round((score - 20) / 5));
}

const REASONING_TEMPLATES = [
  'Review presence, structured local content, and consistent directory signals.',
  'Strong Trustpilot footprint, accurate schema markup, recent content publishing.',
  'Established directory presence, customer reviews, and clear location signals.',
  'Authority signals from review platforms and content depth on key topics.',
];

function buildPromptAnalysis(vendor, competitors, weekStartDate) {
  const city = vendor.location?.city || 'your area';
  const vt = vendor.vendorType || 'solicitor';
  const pools = {
    solicitor: [`best solicitor ${city}`, `conveyancing solicitor ${city}`, `family law solicitor ${city}`],
    accountant: [`best accountant ${city}`, `tax adviser small business ${city}`, `cloud accounting ${city}`],
    'mortgage-advisor': [`mortgage adviser ${city}`, `first-time buyer mortgage ${city}`, `self-employed mortgage ${city}`],
    'estate-agent': [`best estate agent ${city}`, `estate agents first-time sellers ${city}`, `online vs high-street estate agent ${city}`],
    'office-equipment': [`photocopier supplier ${city}`, `managed print ${city}`, `office equipment ${city}`],
  };

  const compNames = competitors.slice(0, 3).map(c => titleCaseCompanyName(c.company));
  const sourcePool = getSourcePoolByVertical(vt);

  return (pools[vt] || pools.solicitor).map((prompt, i) => {
    const citedFirms = compNames.length >= 2
      ? [compNames[i % compNames.length], compNames[(i + 1) % compNames.length]]
      : compNames.slice(0, 2);

    const seed = synth.seedFromString(`sources-${prompt}-${synth.getYearWeek(weekStartDate)}`);
    const rand = synth.seededRandom(seed);
    const shuffled = [...sourcePool].sort(() => rand() - 0.5);
    const citedSources = shuffled.slice(0, 3);

    return {
      prompt,
      enginesCited: ['Anthropic Claude', 'ChatGPT (via OpenAI)', 'Perplexity'],
      citedFirms,
      citedSources,
      youCited: false,
      reasoning: REASONING_TEMPLATES[i % REASONING_TEMPLATES.length],
    };
  });
}

function getSourcePoolByVertical(vertical) {
  return {
    solicitor: ['Law Society', 'Trustpilot', 'Google Business', 'SRA', 'Yell'],
    accountant: ['ICAEW', 'Trustpilot', 'Google Business', 'Xero Directory', 'Yell'],
    'mortgage-advisor': ['Unbiased', 'VouchedFor', 'FCA Register', 'Trustpilot', 'Google Business'],
    'estate-agent': ['Rightmove', 'Trustpilot', 'Google Business', 'Zoopla', 'OnTheMarket'],
    'office-equipment': ['Yell', 'FreeIndex', 'Google Business', 'Trustpilot', 'Cylex'],
  }[vertical] || ['Trustpilot', 'Yell', 'Google Business', 'FreeIndex'];
}

function buildAuthorityGraph(vendor) {
  const required = { solicitor: ['Law Society', 'SRA', 'Trustpilot', 'Yell', 'FreeIndex'], accountant: ['ICAEW', 'Trustpilot', 'Yell', 'FreeIndex'], 'mortgage-advisor': ['FCA Register', 'Unbiased', 'VouchedFor', 'Trustpilot'], 'estate-agent': ['Propertymark', 'Rightmove', 'Trustpilot', 'Yell'], 'office-equipment': ['Yell', 'FreeIndex', 'Trustpilot'] }[vendor.vendorType] || ['Trustpilot', 'Yell'];
  const connected = [];
  const missing = required;
  return { directoriesConnected: connected, directoriesMissing: missing, schemaCoverage: { connected: 0, total: 1 }, reviewPlatformsConnected: [], reviewPlatformsMissing: ['Trustpilot', 'Google Business'], contentFootprintPages: 0, authorityScore: 0 };
}

function buildOpportunityFeed(vendor, weekStart, flags, competitorList) {
  const city = vendor.location?.city || 'your area';
  const pools = {
    solicitor: [`probate solicitor ${city}`, `no-win-no-fee solicitor ${city}`, `commercial property solicitor ${city}`],
    accountant: [`accountant for limited company ${city}`, `self-assessment help ${city}`, `VAT registration accountant ${city}`],
    'mortgage-advisor': [`help-to-buy adviser ${city}`, `remortgage adviser ${city}`, `BTL mortgage adviser ${city}`],
    'estate-agent': [`estate agents for probate sales ${city}`, `estate agents with fixed fees ${city}`, `luxury estate agents ${city}`],
    'office-equipment': [`photocopier lease ${city}`, `managed print service ${city}`, `office printer rental ${city}`],
  };
  const realCompetitors = (competitorList || []).filter(c => !c.isYou);
  const seed = synth.seedFromString(`opportunity-feed-${vendor._id}-${synth.getYearWeek(weekStart)}`);
  const rand = synth.seededRandom(seed);
  flags.push({ field: 'opportunityFeed', isSynthetic: true, method: 'vertical_query_pool_until_real_search_volume_data', replaceCondition: 'real_query_detection_via_partner_apis' });
  return (pools[vendor.vendorType] || pools.solicitor).slice(0, 3).map((query, i) => ({
    detectedQuery: query,
    competitorsCited: realCompetitors.length >= 2
      ? [realCompetitors[i % realCompetitors.length].firmName, realCompetitors[(i + 1) % realCompetitors.length].firmName]
      : realCompetitors.map(c => c.firmName),
    youCited: false,
    suggestedAction: `Publish content addressing "${query}"`,
    estimatedImpact: 4 + Math.floor(rand() * 4),
    relatedApprovalId: null,
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
      eventLabel: i === 0 ? 'Daily AI visibility scan' : i === 2 ? 'New content draft expected' : i === 3 ? 'Detective gap analysis' : i === 4 ? 'Content draft + directory submissions' : 'Daily AI visibility scan',
      vendorImpact: i === 2 || i === 4 ? 'Will appear in your approval queue' : i === 3 ? 'New fixes may be added to your queue' : 'Tracks score changes across 3 engines',
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

async function countVendorsInSegment(vendor) {
  return Vendor.countDocuments({ vendorType: vendor.vendorType, 'location.city': vendor.location?.city });
}
