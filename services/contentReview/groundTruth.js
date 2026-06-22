import { resolveJurisdiction } from '../../lib/config/jurisdictions.js';
import { profileFor } from '../../lib/config/industryProfiles.js';
import { factsFor, isRowVerified } from '../../lib/config/jurisdictionFacts.js';

export function localiseNamedEntities(entities, regime) {
  if (!Array.isArray(entities)) return entities;
  return entities
    .map(e => {
      if (!/HMRC|SDLT|stamp duty/i.test(e)) return e;
      if (!regime) return null;
      if (regime.taxAbbrev === 'SDLT') return e;
      return `${regime.authority} (${regime.taxAbbrev})`;
    })
    .filter(Boolean);
}

export function buildGroundTruthBlock(firm = {}) {
  const { regime, reason } = resolveJurisdiction(firm);
  const prof = profileFor(firm.vendorType);
  const L = [
    '<ground_truth>',
    'Use ONLY these facts. Never infer or illustrate with example numbers. Omit anything not given here.',
  ];

  if (prof && prof.touchesPropertyTax) {
    if (regime) {
      L.push(`PROPERTY TAX: this firm operates in ${regime.country}. Use "${regime.taxName}" (${regime.taxAbbrev}), paid to ${regime.authority}.`);
      L.push(`- Filing deadline: ${regime.filingDeadlineDays} days from completion.`);
      L.push(`- First-time buyer relief: ${regime.firstTimeBuyerRelief ? 'exists' : 'DOES NOT EXIST — do not mention it'}.`);
      L.push(`- NEVER use any of: ${regime.forbiddenTerms.join(', ')}.`);
      L.push('- Do NOT state a specific tax threshold figure; say "the published threshold".');
    } else {
      L.push(`PROPERTY TAX: jurisdiction UNCONFIRMED (${reason}). Do NOT mention any property tax, tax authority, filing deadline, or first-time buyer relief.`);
    }
  }

  if (prof) {
    const num = firm[prof.numberField] || (firm.firmData && firm.firmData[prof.numberField]);
    L.push(`REGULATOR: regulated by ${prof.regulatorFull} (${prof.regulator})${prof.redress ? `, redress via ${prof.redress}` : ''}.`);
    L.push(num
      ? `- Registration number: ${num} (use exactly this; never any other).`
      : '- No verified registration number on file. State NO registration or membership number.');
    L.push(`- Do NOT describe this firm as regulated by: ${prof.foreign.join(', ')}.`);
  }

  const lettingRows = factsFor(firm.vendorType, 'letting');
  if (lettingRows.length > 0 && regime) {
    const isWales = regime.country === 'Wales';
    if (isWales) {
      L.push('LETTING LAW (WALES):');
      for (const row of lettingRows) {
        if (row.wales?.canonical) L.push(`- ${row.id}: use "${row.wales.canonical}".`);
        if (row.forbiddenInWales?.length) L.push(`  NEVER use: ${row.forbiddenInWales.join(', ')}.`);
        if (row.requiredInWales?.length) L.push(`  MUST mention: ${row.requiredInWales.join(', ')}.`);
        if (row.englandOnly) L.push(`  "${row.id}" does NOT apply in Wales — omit entirely.`);
      }
    }
  }

  if (regime?.country === 'Wales') {
    const domain = firm.draftDomain || null;
    const covered = domain !== null
      && factsFor(firm.vendorType, domain).some(isRowVerified);
    if (!covered) {
      L.push('JURISDICTION FALLBACK: this firm is in Wales. For this topic we have no verified Welsh-vs-England legal data. Do NOT state England-specific statutes, Act names, notice periods, or procedures. Keep legal references general and tell the reader to confirm the current Welsh position with the relevant Welsh authority. Never assume English law applies in Wales.');
    }
  }

  L.push('FIRM STATISTICS: state only numbers present in firm_context. Any sales count, years in business, completion time, fee, or percentage about THIS firm not in firm_context MUST be omitted.');
  L.push('</ground_truth>');
  return L.join('\n');
}
