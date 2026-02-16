/**
 * AEO Visibility Report Generator
 *
 * Uses Claude with web search to deeply research a target company,
 * find competitors, identify gaps, and produce a scored report.
 */

import Vendor from '../models/Vendor.js';

const CATEGORY_LABELS = {
  copiers: 'photocopier and managed print',
  telecoms: 'business telecoms and VoIP',
  cctv: 'CCTV and security system',
  it: 'IT support and managed services',
};

const CATEGORY_TO_SERVICE = {
  copiers: 'Photocopiers',
  telecoms: 'Telecoms',
  cctv: 'CCTV',
  it: 'IT',
};

const CATEGORY_SEARCH_HINTS = {
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
};

/**
 * Generate a full AEO visibility report for a company.
 *
 * @param {Object} params
 * @param {string} params.companyName
 * @param {string} params.category - copiers|telecoms|cctv|it
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

  const categoryLabel = CATEGORY_LABELS[category];
  const hints = CATEGORY_SEARCH_HINTS[category] || {};
  const searchQueries = (hints.queries || [`${categoryLabel} companies in {city} UK`])
    .map((q) => q.replace(/\{city\}/g, city));
  const clarification = (hints.clarification || '').replace(/\{city\}/g, city);

  const userPrompt = `You are researching a UK business for an AI visibility audit. Search the web thoroughly.

COMPANY: "${companyName}"
CATEGORY: ${categoryLabel}
CITY/REGION: ${city}

STEP 1: Search for "${companyName}" and find their website, reviews, services, and online presence.
STEP 2: Search for ${searchQueries.map((q) => `"${q}"`).join(' and ')} to find their top competitors in the ${city} area.

${clarification}

Based on your research, respond with ONLY this JSON (no markdown fences, no explanation):

{
  "searchedCompany": {
    "website": "https://example.com or null if not found",
    "hasReviews": true/false,
    "hasPricing": true/false,
    "hasBrands": true/false,
    "hasStructuredData": true/false,
    "hasDetailedServices": true/false,
    "hasSocialMedia": true/false,
    "hasGoogleBusiness": true/false,
    "summary": "2-3 sentence summary of what you found about the company online"
  },
  "competitors": [
    {
      "name": "Competitor Name",
      "description": "What they do — 1 sentence",
      "reason": "Why AI recommends them over the target company — 1 sentence",
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

SCORING RULES:
- score is 0-100 overall AI visibility score
- Each scoreBreakdown sub-score is 0-17 (they should roughly sum to the overall score)
- websiteOptimisation: Does the site have good meta tags, speed, mobile-friendly, schema markup?
- contentAuthority: Does the company have authoritative content, blog posts, case studies?
- directoryPresence: Is the company listed on relevant directories, Google Business, Yell, etc?
- reviewSignals: Google reviews, Trustpilot, industry-specific review sites?
- structuredData: Schema.org markup, JSON-LD, structured data on their website?
- competitivePosition: How visible are they vs competitors? Are they the go-to recommendation?

COMPETITOR RULES:
- Return 4-6 real competitors in the ${city} area
- Each MUST have a real website URL from your search results
- Prioritise local businesses, include 1-2 larger/national players if relevant
- Every company must be a real ${categoryLabel} company, NOT TendorAI
- strengths array should have 2-4 items per competitor

GAP RULES:
- Return 3-5 specific, actionable gaps
- Focus on things the company is missing that competitors have
- Be specific: "No visible Google reviews" not "Poor online presence"

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
  const serviceRegex = new RegExp(CATEGORY_TO_SERVICE[category], 'i');
  const cityRegex = new RegExp(city, 'i');
  const competitorsOnTendorAI = await Vendor.countDocuments({
    'account.status': 'active',
    services: serviceRegex,
    $or: [{ 'location.city': cityRegex }, { 'location.coverage': cityRegex }],
  });

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
