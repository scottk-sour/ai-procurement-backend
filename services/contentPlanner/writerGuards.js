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
  'shows', 'reveals', 'analysis', 'report', 'study', 'research',
  'data', 'survey', 'found', 'indicates', 'reports',
  'according to', 'figures', 'statistics',
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

export function detectPossibleFabrication(draftText) {
  if (!draftText || typeof draftText !== 'string') return [];

  const flagged = [];
  const verbPattern = DATA_VERBS.map(escapeRegex).join('|');
  const numberPattern = '(\\d+[,.]?\\d*\\%?|\\d{1,3}(,\\d{3})+)';

  for (const body of ATTRIBUTION_SOURCES) {
    const b = '\\b' + escapeRegex(body) + '\\b';
    const patternA = new RegExp(b + '[^.]{0,200}' + numberPattern + '[^.]{0,200}(' + verbPattern + ')', 'gi');
    const patternB = new RegExp(b + '[^.]{0,100}(' + verbPattern + ')[^.]{0,200}' + numberPattern, 'gi');
    const patternC = new RegExp('(' + verbPattern + ')[^.]{0,100}' + b + '[^.]{0,200}' + numberPattern, 'gi');

    for (const pat of [patternA, patternB, patternC]) {
      let match;
      while ((match = pat.exec(draftText)) !== null) {
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

export { ATTRIBUTION_SOURCES, REGULATORY_BODIES, DATA_VERBS };
