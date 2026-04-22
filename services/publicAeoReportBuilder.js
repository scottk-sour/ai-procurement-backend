/**
 * Public AEO Report Builder
 *
 * Produces an AeoReport-shaped object for the public /api/public/aeo-report endpoint
 * from real detector output (services/aeoDetector.js) plus live multi-platform AI
 * mention queries (services/platformQuery). No LLM generation of scores, gaps, or
 * searchedCompany booleans — every quantitative field comes from a deterministic check
 * or a live API response.
 *
 * Does not persist. Caller is responsible for AeoReport.create(result).
 */

import { runDetector } from './aeoDetector.js';
import { queryAllPlatforms } from './platformQuery/index.js';
import { isValidBusinessName } from './platformQuery/prompt.js';
import { computeIndustryAverage } from '../utils/computeIndustryAverage.js';
import Vendor from '../models/Vendor.js';

// ─── Category labels (inlined; aeoReportGenerator.js is a separate subsystem) ───

const CATEGORY_LABELS = {
  copiers: 'photocopier and managed print',
  telecoms: 'business telecoms and VoIP',
  cctv: 'CCTV and security system',
  it: 'IT support and managed services',
  conveyancing: 'conveyancing solicitor',
  'family-law': 'family law solicitor',
  'criminal-law': 'criminal law solicitor',
  'commercial-law': 'commercial law solicitor',
  'employment-law': 'employment law solicitor',
  'wills-and-probate': 'wills and probate solicitor',
  immigration: 'immigration solicitor',
  'personal-injury': 'personal injury solicitor',
  'tax-advisory': 'tax advisory accountant',
  'audit-assurance': 'audit and assurance accountant',
  bookkeeping: 'bookkeeping accountant',
  payroll: 'payroll services accountant',
  'corporate-finance': 'corporate finance accountant',
  'business-advisory': 'business advisory accountant',
  'vat-services': 'VAT services accountant',
  'financial-planning': 'financial planning accountant',
  'residential-mortgages': 'Residential Mortgages',
  'buy-to-let': 'Buy-to-Let Mortgages',
  remortgage: 'Remortgage',
  'first-time-buyer': 'First-Time Buyer Mortgages',
  'equity-release': 'Equity Release',
  'commercial-mortgages': 'Commercial Mortgages',
  'protection-insurance': 'Protection Insurance',
  sales: 'Property Sales',
  lettings: 'Lettings',
  'property-management': 'Property Management',
  'block-management': 'Block Management',
  auctions: 'Property Auctions',
  'commercial-property': 'Commercial Property',
  inventory: 'Inventory Services',
};

const CATEGORY_TO_SERVICE = {
  copiers: 'Photocopiers',
  telecoms: 'Telecoms',
  cctv: 'CCTV',
  it: 'IT',
};

// Used for the "${companyName} is ${article} ${noun} in ${city}" summary line.
// Keyed by broad vendor type (solicitor / accountant / mortgage-advisor /
// estate-agent) and by equipment sub-category, with an 'other' fallback.
const CATEGORY_NOUN = {
  solicitor: 'solicitors firm',
  accountant: 'accountancy practice',
  'mortgage-advisor': 'mortgage advisory',
  'estate-agent': 'estate agency',
  copiers: 'photocopier supplier',
  telecoms: 'telecoms supplier',
  cctv: 'CCTV installer',
  it: 'IT support provider',
  other: 'business',
};

// searchedCompany check booleans used for the "X of Y applicable checks
// passing" counter. Tri-state: null/undefined = not checked (excluded),
// true = passing, false = failing.
const CHECK_KEYS = [
  'hasReviews',
  'hasPricing',
  'hasBrands',
  'hasStructuredData',
  'hasDetailedServices',
  'hasSocialMedia',
  'hasGoogleBusiness',
];

// scoreBreakdown sub-scores are scaled to this max in mapScoreBreakdown
// (6 buckets * ~17 ≈ 100). Used by both the scaler and the
// "sub-score below 50%" gap heuristic so there's one source of truth.
const SUB_SCORE_MAX = 17;

const CATEGORY_TO_PRACTICE_AREA = {
  conveyancing: 'Conveyancing',
  'family-law': 'Family Law',
  'criminal-law': 'Criminal Law',
  'commercial-law': 'Commercial Law',
  'employment-law': 'Employment Law',
  'wills-and-probate': 'Wills & Probate',
  immigration: 'Immigration',
  'personal-injury': 'Personal Injury',
  'tax-advisory': 'Tax Advisory',
  'audit-assurance': 'Audit & Assurance',
  bookkeeping: 'Bookkeeping',
  payroll: 'Payroll',
  'corporate-finance': 'Corporate Finance',
  'business-advisory': 'Business Advisory',
  'vat-services': 'VAT',
  'financial-planning': 'Financial Planning',
  'residential-mortgages': 'Residential Mortgages',
  'buy-to-let': 'Buy-to-Let',
  remortgage: 'Remortgage',
  'first-time-buyer': 'First-Time Buyer',
  'equity-release': 'Equity Release',
  'commercial-mortgages': 'Commercial Mortgages',
  'protection-insurance': 'Protection Insurance',
  sales: 'Sales',
  lettings: 'Lettings',
  'property-management': 'Property Management',
  'block-management': 'Block Management',
  auctions: 'Auctions',
  'commercial-property': 'Commercial Property',
  inventory: 'Inventory',
};

const SOLICITOR_CATEGORIES = new Set([
  'conveyancing', 'family-law', 'criminal-law', 'commercial-law',
  'employment-law', 'wills-and-probate', 'immigration', 'personal-injury',
]);
const ACCOUNTANT_CATEGORIES = new Set([
  'tax-advisory', 'audit-assurance', 'bookkeeping', 'payroll',
  'corporate-finance', 'business-advisory', 'vat-services', 'financial-planning',
]);
const MORTGAGE_CATEGORIES = new Set([
  'residential-mortgages', 'buy-to-let', 'remortgage', 'first-time-buyer',
  'equity-release', 'commercial-mortgages', 'protection-insurance',
]);
const ESTATE_AGENT_CATEGORIES = new Set([
  'sales', 'lettings', 'property-management', 'block-management',
  'auctions', 'commercial-property', 'inventory',
]);

function getVendorType(category) {
  if (SOLICITOR_CATEGORIES.has(category)) return 'solicitor';
  if (ACCOUNTANT_CATEGORIES.has(category)) return 'accountant';
  if (MORTGAGE_CATEGORIES.has(category)) return 'mortgage-advisor';
  if (ESTATE_AGENT_CATEGORIES.has(category)) return 'estate-agent';
  return 'equipment';
}

// ─── Gap title map (hardcoded, no LLM) ───

const GAP_TITLES = {
  schema: 'No structured data for AI parsing',
  meta: 'Missing meta title or description',
  h1: 'Missing or weak H1 heading',
  viewport: 'Not mobile optimised',
  ssl: 'Not secured with HTTPS',
  speed: 'Page weight too large',
  social: 'No social media links detected',
  contact: 'Contact details not visible',
  faq: 'No FAQ schema or section',
  content: 'Insufficient content length',
  blog: 'No blog or content hub',
};

const BLOG_GAP_EXPLANATION =
  'AI assistants prefer to cite sources with regular, authoritative content. ' +
  'None of the common blog paths was reachable on your site.';

// ─── Helpers ───

/**
 * Derive at most 5 gaps from detector failures, ordered by points lost (impact) descending.
 * If fewer than 5 checks fail, returns fewer entries — no LLM padding.
 */
function deriveGaps(checks, blogDetection) {
  const gaps = [];
  for (const check of checks || []) {
    if (!check || check.passed) continue;
    const max = check.maxScore ?? 10;
    const score = check.score ?? 0;
    gaps.push({
      key: check.key,
      title: GAP_TITLES[check.key] || check.name || 'Visibility gap',
      explanation: check.recommendation || '',
      impact: max - score,
    });
  }
  if (!blogDetection?.hasBlog) {
    gaps.push({
      key: 'blog',
      title: GAP_TITLES.blog,
      explanation: BLOG_GAP_EXPLANATION,
      impact: 10,
    });
  }
  gaps.sort((a, b) => b.impact - a.impact);
  return gaps.slice(0, 5).map(({ title, explanation }) => ({ title, explanation }));
}

/**
 * Map detector output (10 checks + blog) onto the legacy 6-bucket scoreBreakdown.
 * Returns null for buckets the detector cannot measure (directoryPresence, reviewSignals).
 * competitivePosition is derived from live platformResults.
 */
function mapScoreBreakdown(detectorResult, platformResults) {
  const byKey = Object.create(null);
  for (const c of detectorResult.checks || []) byKey[c.key] = c;

  const scoreOf = (key) => byKey[key]?.score ?? 0;
  const maxOf = (key) => byKey[key]?.maxScore ?? 10;
  const scale = (raw, max) => (max > 0 ? Math.round((raw / max) * SUB_SCORE_MAX) : 0);

  const websiteOptRaw = scoreOf('meta') + scoreOf('h1') + scoreOf('viewport') + scoreOf('ssl');
  const websiteOptMax = maxOf('meta') + maxOf('h1') + maxOf('viewport') + maxOf('ssl');

  const blogBonus = detectorResult.blogDetection?.hasBlog ? 10 : 0;
  const contentAuthRaw = scoreOf('content') + scoreOf('faq') + blogBonus;
  const contentAuthMax = maxOf('content') + maxOf('faq') + 10;

  const structDataRaw = scoreOf('schema');
  const structDataMax = maxOf('schema');

  let competitivePosition = null;
  if (Array.isArray(platformResults) && platformResults.length > 0) {
    const total = platformResults.length;
    const mentioned = platformResults.filter((p) => p.mentioned === true).length;
    competitivePosition = Math.round((mentioned / total) * SUB_SCORE_MAX);
  }

  return {
    websiteOptimisation: scale(websiteOptRaw, websiteOptMax),
    contentAuthority: scale(contentAuthRaw, contentAuthMax),
    structuredData: scale(structDataRaw, structDataMax),
    directoryPresence: null,
    reviewSignals: null,
    competitivePosition,
  };
}

/**
 * Populate legacy searchedCompany checklist booleans from real detector checks.
 * Booleans the current detector cannot verify (reviews, pricing, brands, detailed
 * services, Google Business) are left null — the frontend must render null as
 * "not checked" rather than a red NO.
 */
function mapSearchedCompany({ detectorResult, websiteUrl, summary }) {
  const byKey = Object.create(null);
  for (const c of detectorResult.checks || []) byKey[c.key] = c;
  return {
    website: websiteUrl || null,
    hasReviews: null,
    hasPricing: null,
    hasBrands: null,
    hasStructuredData: byKey.schema?.passed ?? null,
    hasDetailedServices: null,
    hasSocialMedia: byKey.social?.passed ?? null,
    hasGoogleBusiness: null,
    summary: summary ?? null,
  };
}

function articleFor(nextWord) {
  if (!nextWord) return 'a';
  return /^[aeiouAEIOU]/.test(nextWord) ? 'an' : 'a';
}

function getCategoryNoun(category, customIndustry) {
  if (customIndustry) return customIndustry;
  const vendorType = getVendorType(category);
  return CATEGORY_NOUN[vendorType] || CATEGORY_NOUN[category] || CATEGORY_NOUN.other;
}

function countApplicableChecks(sc) {
  let applicable = 0;
  let passing = 0;
  for (const key of CHECK_KEYS) {
    const val = sc?.[key];
    if (val === null || val === undefined) continue;
    applicable += 1;
    if (val === true) passing += 1;
  }
  return { applicable, passing };
}

/**
 * Template-only narrative summary. Never calls an LLM. Describes only what the
 * deterministic detector found. No invented statistics, revenue estimates, or gaps.
 */
function buildSummary({ companyName, category, customIndustry, city, websiteUrl, searchedCompany, gaps }) {
  const noun = getCategoryNoun(category, customIndustry);
  const article = articleFor(noun);
  const { applicable, passing } = countApplicableChecks(searchedCompany);

  let text = `${companyName} is ${article} ${noun} in ${city}.`;
  if (applicable > 0) {
    text += ` Our scan of ${websiteUrl} found ${passing} of ${applicable} applicable AI visibility checks passing.`;
  }
  if (gaps.length > 0) {
    const top = gaps.slice(0, 3).map((g) => g.title).join('; ');
    text += ` Key gaps identified: ${top}.`;
  }
  return text;
}

/**
 * Count structural gaps surfaced by the data: platforms that decisively did
 * not recommend the firm, competitors found, and sub-score categories below
 * half of SUB_SCORE_MAX. Null platform results (timeout/error) and null
 * sub-scores (not computed) are ignored.
 */
function computeGapsIdentified(report) {
  const platformsNotRecommending = (report.platformResults || [])
    .filter((r) => r.mentioned === false).length;
  const competitorsFound = (report.competitors || []).length;
  const breakdown = report.scoreBreakdown || {};
  const subScoreBelow50 = Object.values(breakdown)
    .filter((v) => typeof v === 'number' && v / SUB_SCORE_MAX < 0.5).length;
  return platformsNotRecommending + competitorsFound + subScoreBelow50;
}

/**
 * Aggregate competitor names from live platformResults only. No LLM web-search
 * fallback, no Perplexity backfill. Output rows carry only { name, description, website }
 * — no strengths, no reason.
 */
function aggregateCompetitors(platformResults, companyName) {
  if (!Array.isArray(platformResults) || platformResults.length === 0) return [];
  const companyLower = companyName.toLowerCase();
  const freq = new Map();
  for (const pr of platformResults) {
    if (pr.error || !Array.isArray(pr.competitors) || pr.competitors.length === 0) continue;
    for (const entry of pr.competitors) {
      const compName = typeof entry === 'string' ? entry : entry?.name;
      if (!compName || compName.toLowerCase().includes(companyLower)) continue;
      const key = compName.trim().replace(/\s+/g, ' ');
      if (!isValidBusinessName(key)) continue;
      const existing = freq.get(key);
      if (existing) {
        existing.count++;
        existing.platforms.push(pr.platformLabel);
      } else {
        freq.set(key, { count: 1, platforms: [pr.platformLabel] });
      }
    }
  }
  const ranked = [...freq.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
  );
  return ranked.slice(0, 6).map(([name, data]) => ({
    name,
    description: `Recommended by ${data.platforms.join(', ')}`,
    website: null,
  }));
}

/**
 * Real Mongo count of TendorAI-listed competitors in the same category + city.
 * Unchanged from the current generator's logic — just duplicated inline so this
 * service is self-contained.
 */
async function countCompetitorsOnTendorAI({ category, city }) {
  if (category === 'other') return 0;
  const vendorType = getVendorType(category);
  const cityRegex = new RegExp(city, 'i');
  try {
    if (
      vendorType === 'solicitor' ||
      vendorType === 'accountant' ||
      vendorType === 'mortgage-advisor' ||
      vendorType === 'estate-agent'
    ) {
      const practiceArea = CATEGORY_TO_PRACTICE_AREA[category];
      if (!practiceArea) return 0;
      return await Vendor.countDocuments({
        vendorType,
        practiceAreas: practiceArea,
        'location.city': cityRegex,
      });
    }
    const serviceName = CATEGORY_TO_SERVICE[category];
    if (!serviceName) return 0;
    const serviceRegex = new RegExp(serviceName, 'i');
    return await Vendor.countDocuments({
      'account.status': 'active',
      services: serviceRegex,
      $or: [{ 'location.city': cityRegex }, { 'location.coverage': cityRegex }],
    });
  } catch {
    return 0;
  }
}

// ─── Public entry point ───

/**
 * Build a public AEO report object backed by the real detector + live platform queries.
 * No LLM score, gaps, scoreBreakdown, or competitor invention. Does not persist.
 *
 * @param {Object} params
 * @param {string} params.companyName
 * @param {string} params.category
 * @param {string} params.city
 * @param {string} params.email
 * @param {string} params.websiteUrl
 * @param {string} [params.name]
 * @param {string} [params.source]
 * @param {string} [params.customIndustry]
 * @returns {Promise<Object>} AeoReport-shaped document ready for AeoReport.create(...)
 * @throws {Error} with code 'DETECTOR_FETCH_FAILED' when the target site cannot be fetched
 */
export async function buildPublicReport({
  companyName,
  category,
  city,
  email,
  websiteUrl,
  name,
  source,
  customIndustry,
}) {
  const detectorRaw = await runDetector({ websiteUrl });
  if (detectorRaw.fetchError) {
    const err = new Error(detectorRaw.fetchError);
    err.code = 'DETECTOR_FETCH_FAILED';
    throw err;
  }

  const detectorResult = {
    websiteUrl: detectorRaw.websiteUrl,
    overallScore: detectorRaw.overallScore,
    checks: detectorRaw.checks,
    blogDetection: detectorRaw.blogDetection,
    tendoraiSchemaDetected: detectorRaw.tendoraiSchemaDetected,
    fetchError: null,
    runAt: new Date(),
  };

  const categoryLabel = customIndustry || CATEGORY_LABELS[category] || category;

  const platformResults = await queryAllPlatforms({
    companyName,
    category,
    city,
    categoryLabel,
  }).catch((err) => {
    console.error('[AEO] Platform queries failed:', err.message);
    return [];
  });

  const gaps = deriveGaps(detectorResult.checks, detectorResult.blogDetection);

  const searchedCompany = mapSearchedCompany({
    detectorResult,
    websiteUrl: detectorResult.websiteUrl,
    summary: null,
  });

  const summary = buildSummary({
    companyName,
    category,
    customIndustry,
    city,
    websiteUrl: detectorResult.websiteUrl,
    searchedCompany,
    gaps,
  });
  searchedCompany.summary = summary;

  const scoreBreakdown = mapScoreBreakdown(detectorResult, platformResults);

  const aiMentioned =
    Array.isArray(platformResults) && platformResults.some((p) => p.mentioned === true);
  let aiPosition = null;
  if (aiMentioned) {
    const firstHit = platformResults.find((p) => p.mentioned === true);
    aiPosition = firstHit?.position ?? null;
  }

  let industryAverage = null;
  let industryTypeLabel = category;
  try {
    const avg = await computeIndustryAverage(category);
    industryAverage = avg.average;
    industryTypeLabel = avg.category;
  } catch (e) {
    console.error('[AEO] computeIndustryAverage failed:', e.message);
  }

  const competitorsOnTendorAI = await countCompetitorsOnTendorAI({ category, city });

  const competitors = aggregateCompetitors(platformResults, companyName);
  const aiRecommendations = competitors.map((c) => ({
    name: c.name,
    description: c.description,
  }));

  const result = {
    companyName,
    category,
    customIndustry: customIndustry || null,
    city,
    email: email || undefined,
    name: name || undefined,
    source: source || undefined,
    reportType: 'full',
    score: detectorResult.overallScore,
    scoreBreakdown,
    searchedCompany,
    competitors,
    gaps,
    aiMentioned,
    aiPosition,
    aiRecommendations,
    competitorsOnTendorAI,
    industryAverage,
    industryTypeLabel,
    platformResults,
    detectorResult,
    tier: 'free',
  };
  result.gapsIdentified = computeGapsIdentified(result);
  return result;
}

export default buildPublicReport;
