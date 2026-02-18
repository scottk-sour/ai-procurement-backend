/**
 * AEO Visibility Report Generator
 *
 * Uses Claude with web search to deeply research a target company,
 * find competitors, identify gaps, and produce a scored report.
 *
 * Supports multiple verticals: office equipment, solicitors, accountants.
 */

import Vendor from '../models/Vendor.js';

// ─── Category labels (human-readable) ────────────────────────────────────────

const CATEGORY_LABELS = {
  // Office equipment
  copiers: 'photocopier and managed print',
  telecoms: 'business telecoms and VoIP',
  cctv: 'CCTV and security system',
  it: 'IT support and managed services',
  // Solicitors
  conveyancing: 'conveyancing solicitor',
  'family-law': 'family law solicitor',
  'criminal-law': 'criminal law solicitor',
  'commercial-law': 'commercial law solicitor',
  'employment-law': 'employment law solicitor',
  'wills-and-probate': 'wills and probate solicitor',
  immigration: 'immigration solicitor',
  'personal-injury': 'personal injury solicitor',
  // Accountants
  'tax-advisory': 'tax advisory accountant',
  'audit-assurance': 'audit and assurance accountant',
  bookkeeping: 'bookkeeping accountant',
  payroll: 'payroll services accountant',
  'corporate-finance': 'corporate finance accountant',
  'business-advisory': 'business advisory accountant',
  'vat-services': 'VAT services accountant',
  'financial-planning': 'financial planning accountant',
};

// ─── Category → Vendor service field mapping ─────────────────────────────────

const CATEGORY_TO_SERVICE = {
  copiers: 'Photocopiers',
  telecoms: 'Telecoms',
  cctv: 'CCTV',
  it: 'IT',
};

// Category → practiceAreas mapping for solicitors
const CATEGORY_TO_PRACTICE_AREA = {
  conveyancing: 'Conveyancing',
  'family-law': 'Family Law',
  'criminal-law': 'Criminal Law',
  'commercial-law': 'Commercial Law',
  'employment-law': 'Employment Law',
  'wills-and-probate': 'Wills & Probate',
  immigration: 'Immigration',
  'personal-injury': 'Personal Injury',
  // Accountants
  'tax-advisory': 'Tax Advisory',
  'audit-assurance': 'Audit & Assurance',
  bookkeeping: 'Bookkeeping',
  payroll: 'Payroll',
  'corporate-finance': 'Corporate Finance',
  'business-advisory': 'Business Advisory',
  'vat-services': 'VAT',
  'financial-planning': 'Financial Planning',
};

// ─── Industry-specific search hints and clarifications ───────────────────────

const CATEGORY_SEARCH_HINTS = {
  // Office equipment
  copiers: {
    queries: [
      'Ricoh Konica Minolta photocopier dealer {city} UK',
      'office copier leasing MFP supplier {city}',
    ],
    clarification: `CRITICAL — I am looking for office photocopier and MFP dealers — companies that sell, lease, and service machines from brands like Ricoh, Konica Minolta, Canon, Xerox, Sharp, Kyocera. NOT printing companies, print shops, litho printers, graphic design studios, or signage companies. A copier dealer sells or leases copier HARDWARE (e.g. Ricoh MP C3004, Konica Minolta bizhub). If the website shows printing SERVICES (business cards, flyers, banners), it is a print shop — exclude it. It is OK to return only 2-3 companies if that is all you find.`,
  },
  telecoms: {
    queries: [
      'business phone systems VoIP provider {city} UK',
      'hosted telephony SIP trunks supplier {city}',
    ],
    clarification: `CRITICAL — I am looking for business telecoms providers — companies that supply business phone systems, VoIP, SIP trunks, hosted telephony. NOT mobile phone shops, consumer broadband providers, or pure network/cabling contractors. It is OK to return only 2-3 companies if that is all you find.`,
  },
  cctv: {
    queries: ['CCTV installer {city} UK', 'security systems company {city}'],
    clarification: '',
  },
  it: {
    queries: ['IT support company {city} UK', 'managed IT services provider {city}'],
    clarification: '',
  },
  // Solicitors
  conveyancing: {
    queries: [
      'conveyancing solicitors {city} UK',
      'property solicitor house purchase {city}',
    ],
    clarification: `CRITICAL — I am looking for solicitor firms that handle conveyancing (buying/selling property). They must be SRA-regulated law firms. NOT estate agents, mortgage brokers, or online-only comparison sites. Look for firms that specifically list conveyancing or property law as a service.`,
  },
  'family-law': {
    queries: [
      'family law solicitor {city} UK',
      'divorce solicitor child custody lawyer {city}',
    ],
    clarification: `CRITICAL — I am looking for SRA-regulated solicitor firms practising family law (divorce, child custody, financial settlements, prenuptial agreements). NOT mediators-only, counsellors, or generic legal directories.`,
  },
  'criminal-law': {
    queries: [
      'criminal defence solicitor {city} UK',
      'criminal lawyer legal aid {city}',
    ],
    clarification: `CRITICAL — I am looking for SRA-regulated solicitor firms practising criminal law (defence, magistrates court, crown court). NOT barristers chambers or generic legal directories.`,
  },
  'commercial-law': {
    queries: [
      'commercial solicitor {city} UK',
      'business lawyer contract law {city}',
    ],
    clarification: `CRITICAL — I am looking for SRA-regulated solicitor firms practising commercial law (contracts, company law, M&A, shareholder disputes). NOT accountants or business consultants.`,
  },
  'employment-law': {
    queries: [
      'employment law solicitor {city} UK',
      'unfair dismissal tribunal lawyer {city}',
    ],
    clarification: `CRITICAL — I am looking for SRA-regulated solicitor firms practising employment law (unfair dismissal, discrimination, tribunal claims, settlement agreements). NOT HR consultancies.`,
  },
  'wills-and-probate': {
    queries: [
      'wills and probate solicitor {city} UK',
      'estate planning solicitor {city}',
    ],
    clarification: `CRITICAL — I am looking for SRA-regulated solicitor firms handling wills, probate, estate planning, powers of attorney, trusts. NOT will-writing services that are not law firms.`,
  },
  immigration: {
    queries: [
      'immigration solicitor {city} UK',
      'visa solicitor work permit lawyer {city}',
    ],
    clarification: `CRITICAL — I am looking for SRA-regulated solicitor firms handling immigration (visas, work permits, asylum, citizenship applications, sponsor licences). NOT immigration advisors who are not qualified solicitors.`,
  },
  'personal-injury': {
    queries: [
      'personal injury solicitor {city} UK',
      'accident claims lawyer no win no fee {city}',
    ],
    clarification: `CRITICAL — I am looking for SRA-regulated solicitor firms handling personal injury claims (road traffic accidents, workplace injuries, clinical negligence). NOT claims management companies.`,
  },
  // Accountants
  'tax-advisory': {
    queries: [
      'tax advisor accountant {city} UK',
      'corporation tax self-assessment accountant {city}',
    ],
    clarification: `CRITICAL — I am looking for ICAEW-regulated accountancy firms providing tax advisory services (personal tax, corporation tax, inheritance tax, self-assessment). NOT tax refund companies or unregulated advisors.`,
  },
  'audit-assurance': {
    queries: [
      'audit firm {city} UK',
      'statutory audit accountant {city}',
    ],
    clarification: `CRITICAL — I am looking for ICAEW-regulated accountancy firms providing audit and assurance services. NOT financial advisors or consultancy-only firms.`,
  },
  bookkeeping: {
    queries: [
      'bookkeeping accountant {city} UK',
      'accounts preparation management accounts {city}',
    ],
    clarification: `CRITICAL — I am looking for accountancy firms providing bookkeeping, accounts preparation, and management accounts services. Prefer ICAEW-regulated firms.`,
  },
  payroll: {
    queries: [
      'payroll services accountant {city} UK',
      'payroll bureau RTI pensions {city}',
    ],
    clarification: `CRITICAL — I am looking for accountancy firms providing payroll services (payroll processing, RTI, pension auto-enrolment). NOT payroll software companies.`,
  },
  'corporate-finance': {
    queries: [
      'corporate finance accountant {city} UK',
      'M&A due diligence business valuation {city}',
    ],
    clarification: `CRITICAL — I am looking for accountancy firms providing corporate finance services (M&A, due diligence, valuations, fundraising). NOT investment banks or stockbrokers.`,
  },
  'business-advisory': {
    queries: [
      'business advisory accountant {city} UK',
      'small business consultancy start-up accountant {city}',
    ],
    clarification: `CRITICAL — I am looking for accountancy firms providing business advisory services (consultancy, start-ups, growth planning). NOT generic management consultants.`,
  },
  'vat-services': {
    queries: [
      'VAT accountant {city} UK',
      'VAT returns MTD compliance accountant {city}',
    ],
    clarification: `CRITICAL — I am looking for accountancy firms providing VAT services (VAT returns, MTD compliance, cross-border VAT). NOT tax refund companies.`,
  },
  'financial-planning': {
    queries: [
      'financial planning accountant {city} UK',
      'wealth management retirement planning {city}',
    ],
    clarification: `CRITICAL — I am looking for accountancy firms providing financial planning services (wealth management, retirement planning, estate planning). NOT independent financial advisors who are not accountants.`,
  },
};

// ─── Detect vendor type from category ────────────────────────────────────────

const SOLICITOR_CATEGORIES = new Set([
  'conveyancing', 'family-law', 'criminal-law', 'commercial-law',
  'employment-law', 'wills-and-probate', 'immigration', 'personal-injury',
]);

const ACCOUNTANT_CATEGORIES = new Set([
  'tax-advisory', 'audit-assurance', 'bookkeeping', 'payroll',
  'corporate-finance', 'business-advisory', 'vat-services', 'financial-planning',
]);

function getVendorType(category) {
  if (SOLICITOR_CATEGORIES.has(category)) return 'solicitor';
  if (ACCOUNTANT_CATEGORIES.has(category)) return 'accountant';
  return 'equipment';
}

// ─── Build the checklist section of the prompt per vendorType ─────────────────

function getChecklistPrompt(vendorType) {
  if (vendorType === 'solicitor') {
    return `  "searchedCompany": {
    "website": "https://example.com or null if not found",
    "hasReviews": true/false (Google reviews, Trustpilot, ReviewSolicitors, etc.),
    "hasPricing": true/false (fee estimates, fixed-fee packages, pricing page),
    "hasBrands": true/false (SRA regulated, Law Society accredited, Lexcel, CQS, legal aid),
    "hasStructuredData": true/false (schema.org/LegalService markup, JSON-LD),
    "hasDetailedServices": true/false (detailed practice area pages with process info),
    "hasSocialMedia": true/false (LinkedIn, Facebook, Twitter/X presence),
    "hasGoogleBusiness": true/false (Google Business Profile with reviews),
    "summary": "2-3 sentence summary of what you found about the firm online"
  }`;
  }

  if (vendorType === 'accountant') {
    return `  "searchedCompany": {
    "website": "https://example.com or null if not found",
    "hasReviews": true/false (Google reviews, Trustpilot, etc.),
    "hasPricing": true/false (fee estimates, fixed-fee packages, pricing page),
    "hasBrands": true/false (ICAEW regulated, ACCA, chartered status, QuickBooks/Xero partner),
    "hasStructuredData": true/false (schema.org/AccountingService markup, JSON-LD),
    "hasDetailedServices": true/false (detailed service pages for tax, audit, bookkeeping etc.),
    "hasSocialMedia": true/false (LinkedIn, Facebook, Twitter/X presence),
    "hasGoogleBusiness": true/false (Google Business Profile with reviews),
    "summary": "2-3 sentence summary of what you found about the firm online"
  }`;
  }

  // Default: office equipment
  return `  "searchedCompany": {
    "website": "https://example.com or null if not found",
    "hasReviews": true/false,
    "hasPricing": true/false,
    "hasBrands": true/false,
    "hasStructuredData": true/false,
    "hasDetailedServices": true/false,
    "hasSocialMedia": true/false,
    "hasGoogleBusiness": true/false,
    "summary": "2-3 sentence summary of what you found about the company online"
  }`;
}

// ─── Scoring hints per vendorType ────────────────────────────────────────────

function getScoringHints(vendorType) {
  if (vendorType === 'solicitor') {
    return `SCORING RULES:
- score is 0-100 overall AI visibility score
- Each scoreBreakdown sub-score is 0-17 (they should roughly sum to the overall score)
- websiteOptimisation: Does the site have good meta tags, speed, mobile-friendly, schema markup (LegalService)?
- contentAuthority: Does the firm have authoritative content — legal guides, blog posts, case studies, FAQ pages?
- directoryPresence: Is the firm on the SRA register, Law Society Find a Solicitor, legal directories (Chambers, Legal 500), Google Business?
- reviewSignals: Google reviews, Trustpilot, ReviewSolicitors, client testimonials?
- structuredData: Schema.org/LegalService markup, JSON-LD, LocalBusiness structured data?
- competitivePosition: How visible are they vs other solicitors in the area? Would AI recommend them?`;
  }

  if (vendorType === 'accountant') {
    return `SCORING RULES:
- score is 0-100 overall AI visibility score
- Each scoreBreakdown sub-score is 0-17 (they should roughly sum to the overall score)
- websiteOptimisation: Does the site have good meta tags, speed, mobile-friendly, schema markup (AccountingService)?
- contentAuthority: Does the firm have authoritative content — tax guides, blog posts, case studies, FAQ pages?
- directoryPresence: Is the firm on the ICAEW directory, ACCA directory, Google Business, accountancy directories?
- reviewSignals: Google reviews, Trustpilot, client testimonials?
- structuredData: Schema.org/AccountingService markup, JSON-LD, LocalBusiness structured data?
- competitivePosition: How visible are they vs other accountants in the area? Would AI recommend them?`;
  }

  // Default: office equipment
  return `SCORING RULES:
- score is 0-100 overall AI visibility score
- Each scoreBreakdown sub-score is 0-17 (they should roughly sum to the overall score)
- websiteOptimisation: Does the site have good meta tags, speed, mobile-friendly, schema markup?
- contentAuthority: Does the company have authoritative content, blog posts, case studies?
- directoryPresence: Is the company listed on relevant directories, Google Business, Yell, etc?
- reviewSignals: Google reviews, Trustpilot, industry-specific review sites?
- structuredData: Schema.org markup, JSON-LD, structured data on their website?
- competitivePosition: How visible are they vs competitors? Are they the go-to recommendation?`;
}

// ─── Gap hints per vendorType ────────────────────────────────────────────────

function getGapHints(vendorType) {
  if (vendorType === 'solicitor') {
    return `GAP RULES:
- Return 3-5 specific, actionable gaps
- Focus on things the firm is missing that competing solicitors have
- Common solicitor gaps: no SRA-linked website, no legal directory listings, no client testimonials, no detailed practice area pages, no fee transparency, no schema markup, no blog/legal guides
- Be specific: "No visible client reviews on Google" not "Poor online presence"`;
  }

  if (vendorType === 'accountant') {
    return `GAP RULES:
- Return 3-5 specific, actionable gaps
- Focus on things the firm is missing that competing accountants have
- Common accountant gaps: no ICAEW directory link, no client testimonials, no detailed service pages, no fee transparency, no schema markup, no blog/tax guides, no cloud accounting partner badges (Xero/QuickBooks)
- Be specific: "No visible client reviews on Google" not "Poor online presence"`;
  }

  return `GAP RULES:
- Return 3-5 specific, actionable gaps
- Focus on things the company is missing that competitors have
- Be specific: "No visible Google reviews" not "Poor online presence"`;
}

/**
 * Generate a full AEO visibility report for a company.
 *
 * @param {Object} params
 * @param {string} params.companyName
 * @param {string} params.category - copiers|telecoms|cctv|it|conveyancing|family-law|...
 * @param {string} params.city
 * @param {string} [params.email]
 * @returns {Object} Full report data ready for saving
 */
export async function generateFullReport({ companyName, category, city, email }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const vendorType = getVendorType(category);
  const categoryLabel = CATEGORY_LABELS[category] || category;
  const hints = CATEGORY_SEARCH_HINTS[category] || {};
  const searchQueries = (hints.queries || [`${categoryLabel} companies in {city} UK`])
    .map((q) => q.replace(/\{city\}/g, city));
  const clarification = (hints.clarification || '').replace(/\{city\}/g, city);

  const isProfessional = vendorType === 'solicitor' || vendorType === 'accountant';
  const entityLabel = isProfessional ? 'firm' : 'company';
  const entityLabelPlural = isProfessional ? 'firms' : 'companies';
  const checklistPrompt = getChecklistPrompt(vendorType);
  const scoringHints = getScoringHints(vendorType);
  const gapHints = getGapHints(vendorType);

  const userPrompt = `You are researching a UK business for an AI visibility audit. Search the web thoroughly.

COMPANY: "${companyName}"
CATEGORY: ${categoryLabel}
CITY/REGION: ${city}

STEP 1: Search for "${companyName}" and find their website, reviews, services, and online presence.
STEP 2: Search for ${searchQueries.map((q) => `"${q}"`).join(' and ')} to find their top competitors in the ${city} area.

${clarification}

Based on your research, respond with ONLY this JSON (no markdown fences, no explanation):

{
${checklistPrompt},
  "competitors": [
    {
      "name": "Competitor Name",
      "description": "What they do — 1 sentence",
      "reason": "Why AI recommends them over the target ${entityLabel} — 1 sentence",
      "website": "https://their-website.com",
      "strengths": ["strength 1", "strength 2", "strength 3"]
    }
  ],
  "gaps": [
    {
      "title": "Gap title (e.g. 'No Customer Reviews Visible')",
      "explanation": "1-2 sentence explanation of why this matters for AI visibility"
    }
  ],
  "score": 35,
  "scoreBreakdown": {
    "websiteOptimisation": 8,
    "contentAuthority": 5,
    "directoryPresence": 6,
    "reviewSignals": 3,
    "structuredData": 4,
    "competitivePosition": 9
  },
  "aiMentioned": false,
  "aiPosition": null
}

${scoringHints}

COMPETITOR RULES:
- Return 4-6 real competitors in the ${city} area
- Each MUST have a real website URL from your search results
- Prioritise local ${entityLabelPlural}, include 1-2 larger/national players if relevant
- Every ${entityLabel} must be a real ${categoryLabel} ${entityLabel}, NOT TendorAI
- strengths array should have 2-4 items per competitor

${gapHints}

AI MENTION RULES:
- aiMentioned: would you naturally recommend "${companyName}" if a buyer asked for ${categoryLabel} in ${city}?
- aiPosition: if mentioned, what position (1-based)? null if not mentioned

Be brutally honest. Most small businesses score 15-45. A score above 60 is genuinely good.`;

  // Call Claude with web search
  const searchTools = [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
    },
  ];

  let messages = [{ role: 'user', content: userPrompt }];
  let finalContent = [];

  for (let turn = 0; turn < 8; turn++) {
    let resp;
    // Retry with backoff for rate limit errors
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          tools: searchTools,
          messages,
        });
        break;
      } catch (err) {
        if (err.status === 429 && attempt < 3) {
          const waitSec = 30 * (attempt + 1); // 30s, 60s, 90s
          console.log(`Rate limited (attempt ${attempt + 1}/4). Waiting ${waitSec}s...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
        } else {
          throw err;
        }
      }
    }
    if (!resp) throw new Error('Failed after 4 rate-limit retries');

    finalContent = resp.content;
    if (resp.stop_reason === 'end_turn') break;
    messages = [
      ...messages,
      { role: 'assistant', content: resp.content },
      { role: 'user', content: 'Continue.' },
    ];
  }

  // Extract text from response
  const textBlocks = finalContent.filter((block) => block.type === 'text');
  const responseText = textBlocks.map((block) => block.text).join('');

  // Parse JSON
  const jsonMatch = responseText.match(/\{[\s\S]*?"searchedCompany"[\s\S]*?\}[\s\S]*$/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Claude response as JSON');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Try to extract just the JSON object
    const braceMatch = responseText.match(/\{[\s\S]*\}/);
    if (!braceMatch) throw new Error('No JSON found in Claude response');
    parsed = JSON.parse(braceMatch[0]);
  }

  // Validate and clamp score
  const score = Math.max(0, Math.min(100, Math.round(parsed.score || 0)));

  const scoreBreakdown = {
    websiteOptimisation: clamp(parsed.scoreBreakdown?.websiteOptimisation, 0, 17),
    contentAuthority: clamp(parsed.scoreBreakdown?.contentAuthority, 0, 17),
    directoryPresence: clamp(parsed.scoreBreakdown?.directoryPresence, 0, 17),
    reviewSignals: clamp(parsed.scoreBreakdown?.reviewSignals, 0, 17),
    structuredData: clamp(parsed.scoreBreakdown?.structuredData, 0, 17),
    competitivePosition: clamp(parsed.scoreBreakdown?.competitivePosition, 0, 17),
  };

  const competitors = (parsed.competitors || []).map((c) => ({
    name: c.name || 'Unknown',
    description: c.description || '',
    reason: c.reason || '',
    website: c.website || null,
    strengths: Array.isArray(c.strengths) ? c.strengths.slice(0, 5) : [],
  }));

  const gaps = (parsed.gaps || []).map((g) => ({
    title: g.title || 'Unknown Gap',
    explanation: g.explanation || '',
  }));

  const searchedCompany = {
    website: parsed.searchedCompany?.website || null,
    hasReviews: !!parsed.searchedCompany?.hasReviews,
    hasPricing: !!parsed.searchedCompany?.hasPricing,
    hasBrands: !!parsed.searchedCompany?.hasBrands,
    hasStructuredData: !!parsed.searchedCompany?.hasStructuredData,
    hasDetailedServices: !!parsed.searchedCompany?.hasDetailedServices,
    hasSocialMedia: !!parsed.searchedCompany?.hasSocialMedia,
    hasGoogleBusiness: !!parsed.searchedCompany?.hasGoogleBusiness,
    summary: parsed.searchedCompany?.summary || null,
  };

  // Build backward-compatible aiRecommendations array
  const aiRecommendations = competitors.map((c) => ({
    name: c.name,
    description: c.description,
    reason: c.reason,
  }));

  // Count competitors on TendorAI
  let competitorsOnTendorAI = 0;
  const cityRegex = new RegExp(city, 'i');

  if (vendorType === 'solicitor' || vendorType === 'accountant') {
    const practiceArea = CATEGORY_TO_PRACTICE_AREA[category];
    if (practiceArea) {
      competitorsOnTendorAI = await Vendor.countDocuments({
        vendorType,
        practiceAreas: practiceArea,
        'location.city': cityRegex,
      });
    }
  } else {
    const serviceRegex = new RegExp(CATEGORY_TO_SERVICE[category], 'i');
    competitorsOnTendorAI = await Vendor.countDocuments({
      'account.status': 'active',
      services: serviceRegex,
      $or: [{ 'location.city': cityRegex }, { 'location.coverage': cityRegex }],
    });
  }

  return {
    companyName,
    category,
    city,
    email: email || undefined,
    reportType: 'full',
    aiMentioned: !!parsed.aiMentioned,
    aiPosition: parsed.aiPosition || null,
    aiRecommendations,
    competitorsOnTendorAI,
    score,
    scoreBreakdown,
    searchedCompany,
    competitors,
    gaps,
  };
}

function clamp(val, min, max) {
  if (val == null || isNaN(val)) return 0;
  return Math.max(min, Math.min(max, Math.round(val)));
}
