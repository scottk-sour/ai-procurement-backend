const WALES_AREAS = ['CF', 'NP', 'SA', 'LL', 'LD'];
const BORDER_AREAS = ['SY', 'CH', 'HR', 'GL', 'WR'];
const SCOTLAND_AREAS = ['AB', 'DD', 'DG', 'EH', 'FK', 'G', 'HS', 'IV', 'KA', 'KW', 'KY', 'ML', 'PA', 'PH', 'TD', 'ZE'];

export const TAX_REGIMES = {
  WALES: {
    country: 'Wales', taxName: 'Land Transaction Tax', taxAbbrev: 'LTT',
    authority: 'Welsh Revenue Authority', authorityAbbrev: 'WRA',
    filingDeadlineDays: 30, firstTimeBuyerRelief: false,
    forbiddenTerms: ['SDLT', 'Stamp Duty Land Tax', 'HMRC', 'LBTT',
      'first-time buyer relief', 'first time buyer relief'],
  },
  SCOTLAND: {
    country: 'Scotland', taxName: 'Land and Buildings Transaction Tax', taxAbbrev: 'LBTT',
    authority: 'Revenue Scotland', authorityAbbrev: 'Revenue Scotland',
    filingDeadlineDays: 30, firstTimeBuyerRelief: true,
    forbiddenTerms: ['SDLT', 'Stamp Duty Land Tax', 'HMRC', 'LTT',
      'Land Transaction Tax', 'WRA', 'Welsh Revenue Authority'],
  },
  ENGLAND: {
    country: 'England', taxName: 'Stamp Duty Land Tax', taxAbbrev: 'SDLT',
    authority: 'HM Revenue & Customs', authorityAbbrev: 'HMRC',
    filingDeadlineDays: 14, firstTimeBuyerRelief: true,
    forbiddenTerms: ['LTT', 'Land Transaction Tax', 'WRA', 'Welsh Revenue Authority',
      'LBTT', 'Land and Buildings Transaction Tax', 'Revenue Scotland'],
  },
};

export function postcodeArea(pc) {
  if (!pc) return null;
  const m = String(pc).toUpperCase().trim().match(/^([A-Z]{1,2})/);
  return m ? m[1] : null;
}

export function resolveJurisdiction(firm = {}) {
  const loc = firm.location || {};
  const explicit = String(firm.country || firm.jurisdiction || loc.country || loc.region || '').toLowerCase();
  if (/\b(wales|cymru)\b/.test(explicit)) return { regime: TAX_REGIMES.WALES, confident: true };
  if (/\bscotland\b/.test(explicit)) return { regime: TAX_REGIMES.SCOTLAND, confident: true };
  if (/\b(england|northern ireland)\b/.test(explicit)) return { regime: TAX_REGIMES.ENGLAND, confident: true };

  const area = postcodeArea(firm.postcode || loc.postcode || (firm.contactInfo || {}).postcode);
  if (!area) return { regime: null, confident: false, reason: 'No country or postcode on firm' };
  if (BORDER_AREAS.includes(area)) return { regime: null, confident: false, reason: `Border postcode area ${area} — confirm country` };
  if (WALES_AREAS.includes(area)) return { regime: TAX_REGIMES.WALES, confident: true };
  if (SCOTLAND_AREAS.includes(area)) return { regime: TAX_REGIMES.SCOTLAND, confident: true };
  return { regime: TAX_REGIMES.ENGLAND, confident: true };
}
