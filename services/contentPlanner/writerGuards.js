// Single source of truth for every name a fabricated stat might be pinned to,
// across all four verticals: regulators, trade press, and named software/portals.
// detectPossibleFabrication() reads this list. Add new names here only.
const ATTRIBUTION_SOURCES = [
  // Cross-vertical government / stats
  'HMRC', 'gov.uk', 'Companies House', 'ONS', 'Office for National Statistics',
  'Bank of England', 'CMA',
  // Solicitor
  'SRA', 'Solicitors Regulation Authority', 'Law Society', 'Law Society Gazette',
  'Legal Ombudsman', 'HM Land Registry', 'Land Registry', 'Conveyancing Quality Scheme',
  'CQS', 'Legal Futures', 'Solicitors Journal', "Today's Conveyancer",
  // Accountant
  'ICAEW', 'ACCA', 'AAT', 'CIOT', 'Xero', 'QuickBooks', 'Sage', 'FreeAgent',
  'AccountingWEB', 'Accountancy Age', 'Accountancy Daily', 'Economia',
  // Mortgage adviser
  'FCA', 'Financial Conduct Authority', 'FSCS', 'Financial Services Compensation Scheme',
  'Financial Ombudsman Service', 'Financial Ombudsman', 'FOS', 'MCOB', 'CeMAP',
  'Mortgage Strategy', 'FT Adviser', 'Mortgage Solutions', 'Money Marketing',
  // Estate agent
  'Propertymark', 'NAEA', 'ARLA', 'RICS', 'TPO', 'Property Ombudsman', 'PRS',
  'Estate Agents Act 1979', 'Tenant Fees Act 2019',
  'Rightmove', 'Zoopla', 'OnTheMarket',
  'Property Industry Eye', 'Estate Agent Today', 'Letting Agent Today', 'Negotiator Magazine',
];

// Kept under the old name for backward compatibility with existing imports/tests.
const REGULATORY_BODIES = ATTRIBUTION_SOURCES;

const DATA_VERBS = [
  'shows', 'reveals', 'analysis', 'analytics', 'report', 'study', 'research',
  'data', 'survey', 'found', 'finds', 'indicates', 'indicate', 'reports',
  'reported', 'revealed', 'according to', 'figures', 'statistics',
  'identifies', 'identify', 'emphasise', 'emphasises', 'emphasizes',
  'suggest', 'suggests', 'estimate', 'estimates', 'confirm', 'confirms',
  'highlight', 'highlights', 'notes', 'recommends', 'advises', 'warns',
];

// Escape regex-special characters so names like "gov.uk" are treated literally.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildCtaForVendor(vendor) {
  const proTiers = new Set(['pro', 'verified', 'managed', 'enterprise']);
  if (proTiers.has(vendor.tier)) {
    const slug = vendor.slug || vendor.company?.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return {
      ctaUrl: `https://www.tendorai.com/suppliers/vendor/${slug}`,
      ctaText: `Get in touch with ${vendor.company}`,
    };
  }
  return {
    ctaUrl: 'https://www.tendorai.com/aeo-report',
    ctaText: 'Get your free AI Visibility Report',
  };
}

// Legislation names are verifiable facts, not fabrication sources.
const LEGISLATION_PATTERN = /\b(?:\w+\s+){0,4}Act\s+\d{4}\b|\bRegulations?\s+\d{4}\b|\bAML\b|\bGDPR\b/gi;

export function detectPossibleFabrication(draftText) {
  if (!draftText || typeof draftText !== 'string') return [];

  // Strip placeholder tokens so org names inside them aren't flagged.
  const cleaned = draftText
    .replace(/\[FIRM_DATA:[^\]]*\]/g, '___PLACEHOLDER___')
    .replace(/\[FIRM TO PROVIDE[^\]]*\]/g, '___PLACEHOLDER___');

  // Strip legislation references so "Estate Agents Act 1979" isn't treated as a source + number.
  const text = cleaned.replace(LEGISLATION_PATTERN, '___LEGISLATION___');

  const flagged = [];
  const verbPattern = DATA_VERBS.map(escapeRegex).join('|');
  const numberPattern = '(\\d+(?:[,.]\\d+)*(?:\\s*(?:-|–)\\s*\\d+(?:[,.]\\d+)*)?\\s*(?:%|per\\s*cent|percent|days?|weeks?|months?|hours?|x\\b))';

  // Sentence-scoped patterns: [^.!?\n] keeps matches within a single sentence.
  // Pattern B: body → verb → number (most common: "Propertymark data shows 40%")
  // Pattern C: verb → body → number ("According to Propertymark, 40%")
  // Pattern A dropped — it was body → number → verb which is too loose and caused false positives.

  for (const body of ATTRIBUTION_SOURCES) {
    const b = '\\b' + escapeRegex(body) + '\\b';
    const patternB = new RegExp(b + '[^.!?\\n]{0,60}(' + verbPattern + ')[^.!?\\n]{0,100}' + numberPattern, 'gi');
    const patternC = new RegExp('(' + verbPattern + ')[^.!?\\n]{0,60}' + b + '[^.!?\\n]{0,100}' + numberPattern, 'gi');

    for (const pat of [patternB, patternC]) {
      let match;
      while ((match = pat.exec(text)) !== null) {
        if (match[0].includes('___PLACEHOLDER___')) continue;
        if (match[0].includes('___LEGISLATION___')) continue;
        const alreadyFlagged = flagged.some(f => Math.abs(f.position - match.index) < 50);
        if (!alreadyFlagged) {
          flagged.push({ body, excerpt: match[0].substring(0, 200), position: match.index });
        }
      }
    }
  }

  return flagged;
}

export function countAllPlaceholderFormats(text) {
  if (!text || typeof text !== 'string') return 0;
  const keyed = (text.match(/\[FIRM_DATA:\s*[a-zA-Z_]+\s*\|[^\]]+\]/g) || []).length;
  const legacy = (text.match(/\[FIRM TO PROVIDE[: ][^\]]*\]/gi) || []).length;
  return keyed + legacy;
}

const PERFORMANCE_NOUNS = [
  'sold', 'sell', 'selling', 'completed', 'completing', 'completion',
  'achieved', 'achieving', 'handled', 'handling', 'processed', 'processing',
  'managed', 'managing', 'transactions', 'transaction', 'properties', 'property',
  'cases', 'clients', 'instructions', 'completions',
  'sales', 'lettings', 'letting', 'exchanges', 'exchange',
];

const PLACEHOLDER_FENCE = /\[FIRM_DATA:[^\]]+\]|\[FIRM TO PROVIDE[^\]]*\]/g;

// Firm-subject indicators — the claim is attributed to THIS firm
const FIRM_SUBJECT = /\b(?:we|our|us|the firm|the team|the company)\b/i;

// Generic-industry subjects — the claim is about the market/process, not the firm
const GENERIC_SUBJECT = /\b(?:sales|conveyancing|transactions?|properties|the (?:average|typical|standard)|most|many|an? average)\b.*\b(?:typically|usually|generally|often|on average|normally|commonly|tend to|can take|range from)\b/i;

// BYPASSED at publish-time — replaced by semantic Haiku check in approvalQueue.js.
// Kept for reference/tests. The regex approach false-positived on generic process
// descriptions, markdown tables, years, and industry vocabulary it couldn't generalise.
export function detectFirmPerformanceClaims(draftText, firmName) {
  if (!draftText || typeof draftText !== 'string') return [];

  // Strip placeholders and legislation so they don't trigger false positives
  const stripped = draftText
    .replace(PLACEHOLDER_FENCE, '___PLACEHOLDER___')
    .replace(LEGISLATION_PATTERN, '___LEGISLATION___');

  const flagged = [];

  // Split on sentence boundaries AND markdown structure
  const segments = stripped.split(/(?<=[.!?])\s+|\n+/).filter(s => s.trim());

  for (const segment of segments) {
    const trimmed = segment.trim();
    const clean = trimmed.replace(/^[-*•|#>\s]+/, '').trim();
    if (!clean) continue;
    if (clean.includes('___PLACEHOLDER___')) continue;
    if (clean.includes('___LEGISLATION___')) continue;

    // Skip markdown headings and table rows — structural, not assertions
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (/^\|/.test(trimmed)) continue;

    // Must contain a meaningful number (not a list marker)
    const hasNumber = /\d{2,}|\d+\s*%/.test(clean);
    if (!hasNumber) continue;

    // Must contain a whole-word performance noun
    const hasPerformanceNoun = PERFORMANCE_NOUNS.some(n => {
      const re = new RegExp('\\b' + n + '\\b', 'i');
      return re.test(clean);
    });
    if (!hasPerformanceNoun) continue;

    // Subject gate: is the claim attributed to the firm or to the generic industry?
    const hasFirmSubject = FIRM_SUBJECT.test(clean);
    const hasGenericSubject = GENERIC_SUBJECT.test(clean);

    // If the subject is clearly generic industry ("sales typically take 4-8 weeks"), pass
    if (hasGenericSubject && !hasFirmSubject) continue;

    // If the subject is the firm ("we sold 87", "our average is 10 weeks"), flag
    // If ambiguous (no clear subject either way), flag — the article is published
    // in the firm's voice, so an unattributed claim defaults to the firm
    flagged.push({
      type: 'firm_performance_claim',
      excerpt: clean.substring(0, 200),
      position: stripped.indexOf(segment),
    });
  }

  return flagged;
}

export { ATTRIBUTION_SOURCES, REGULATORY_BODIES, DATA_VERBS };
