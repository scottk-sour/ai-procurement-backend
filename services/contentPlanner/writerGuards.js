const REGULATORY_BODIES = [
  'Propertymark', 'Property Ombudsman', 'RICS', 'NAEA', 'ARLA',
  'SRA', 'FCA', 'ICAEW', 'ACCA', 'AAT', 'ONS', 'gov\\.uk',
  'Companies House', 'Land Registry', 'HMRC', 'CMA', 'FOS',
  'Financial Ombudsman', 'TPO',
];

const DATA_VERBS = [
  'shows', 'reveals', 'analysis', 'report', 'study', 'research',
  'data', 'survey', 'found', 'indicates', 'reports',
];

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
  const verbPattern = DATA_VERBS.join('|');

  const numberPattern = '(\\d+[,.]?\\d*\\%?|\\d{1,3}(,\\d{3})+)';

  for (const body of REGULATORY_BODIES) {
    const cleanBody = body.replace(/\\\./g, '.');

    // Pattern A: body → number → verb (e.g. "Propertymark analysis of 45,000 transactions shows")
    const patternA = new RegExp(body + '[^.]{0,200}' + numberPattern + '[^.]{0,200}(' + verbPattern + ')', 'gi');
    // Pattern B: body → verb → number (e.g. "RICS data indicates 73%")
    const patternB = new RegExp(body + '[^.]{0,100}(' + verbPattern + ')[^.]{0,200}' + numberPattern, 'gi');
    // Pattern C: verb → body → number (e.g. "According to the Property Ombudsman... 89%")
    const patternC = new RegExp('(' + verbPattern + ')[^.]{0,100}' + body + '[^.]{0,200}' + numberPattern, 'gi');

    for (const pat of [patternA, patternB, patternC]) {
      let match;
      while ((match = pat.exec(draftText)) !== null) {
        const alreadyFlagged = flagged.some(f => Math.abs(f.position - match.index) < 50);
        if (!alreadyFlagged) {
          flagged.push({
            body: cleanBody,
            excerpt: match[0].substring(0, 200),
            position: match.index,
          });
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

export { REGULATORY_BODIES, DATA_VERBS };
