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
  const country = regime?.country;
  const isWales = country === 'Wales';
  const isEngland = country === 'England';
  const isScotland = country === 'Scotland';

  const L = [
    '<ground_truth>',
    'Use ONLY these facts. Never infer or illustrate with example numbers. Omit anything not given here.',
  ];

  const rows = factsFor(firm.vendorType);

  if (!regime && rows.length > 0) {
    L.push(`JURISDICTION: UNCONFIRMED (${reason}). Do NOT mention any property tax, tax authority, filing deadline, tenancy legislation, or jurisdiction-specific terms.`);
  }

  for (const row of rows) {
    if (!regime) break;
    if (!isRowVerified(row)) continue;

    const local = isWales ? row.wales : isScotland ? row.scotland : isEngland ? row.england : null;
    if (!local) continue;

    if (row.id === 'property_tax' && prof?.touchesPropertyTax) {
      L.push(`PROPERTY TAX: this firm operates in ${country}. Use "${local.canonical}", paid to ${local.authority}.`);
      L.push(`- Filing deadline: ${regime.filingDeadlineDays} days from completion.`);
      L.push(`- First-time buyer relief: ${regime.firstTimeBuyerRelief ? 'exists' : 'DOES NOT EXIST — do not mention it'}.`);
      const forbidden = isWales ? row.forbiddenInWales : isScotland ? row.forbiddenInScotland : row.forbiddenInEngland;
      if (forbidden?.length) L.push(`- NEVER use any of: ${forbidden.join(', ')}.`);
      L.push('- Do NOT state a specific tax threshold figure; say "the published threshold".');
    } else {
      L.push(`${row.id.toUpperCase().replace(/_/g, ' ')}: in ${country}, use "${local.canonical}".`);
      const forbidden = isWales ? row.forbiddenInWales : isScotland ? row.forbiddenInScotland : row.forbiddenInEngland;
      if (forbidden?.length) L.push(`- NEVER use any of: ${forbidden.join(', ')}.`);
      if (isWales && row.requiredInWales?.length) L.push(`- MUST mention: ${row.requiredInWales.join(', ')}.`);
      if (row.englandOnly && isWales) L.push('- This concept does NOT apply in Wales — omit entirely.');
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

  L.push('FIRM STATISTICS: state only numbers present in firm_context. Any sales count, years in business, completion time, fee, or percentage about THIS firm not in firm_context MUST be omitted.');
  L.push('</ground_truth>');
  return L.join('\n');
}
