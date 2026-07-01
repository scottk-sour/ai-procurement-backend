import { resolveJurisdiction } from '../../lib/config/jurisdictions.js';
import { profileFor } from '../../lib/config/industryProfiles.js';
import { factsFor } from '../../lib/config/jurisdictionFacts.js';

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
    const allRows = factsFor(firm.vendorType);
    if (allRows.length === 0) {
      L.push('JURISDICTION FALLBACK: this firm is in Wales. For this topic we have no verified Welsh-vs-England legal data. Do NOT state England-specific statutes, Act names, notice periods, or procedures. Keep legal references general and tell the reader to confirm the current Welsh position with the relevant Welsh authority. Never assume English law applies in Wales.');
    }
  }

  const statuteRows = factsFor(firm.vendorType, 'statute');
  if (statuteRows.length > 0) {
    L.push('STATUTE CITATIONS:');
    for (const row of statuteRows) {
      if (row.correctAct) {
        L.push(`- For ${row.id.replace(/_/g, ' ')}: the correct statute is "${row.correctAct}".`);
      }
      if (Array.isArray(row.wrongActs) && row.wrongActs.length) {
        L.push(`  Do NOT attribute this to: ${row.wrongActs.join(', ')}.`);
      }
      if (row.note) {
        L.push(`  Note: ${row.note}`);
      }
    }
  }

  L.push('FIRM STATISTICS: state only numbers present in firm_context. Any sales count, years in business, completion time, fee, or percentage about THIS firm not in firm_context MUST be omitted.');
  L.push('</ground_truth>');
  return L.join('\n');
}

export function buildJurisdictionRulesBlock(vendorType, country) {
  if (!vendorType || !country) return '';

  const allRows = factsFor(vendorType);
  if (allRows.length === 0) return '';

  const isWales = country === 'Wales';
  const isEngland = country === 'England';
  const isScotland = country === 'Scotland';

  const L = [`## JURISDICTION RULES — ${country} ${vendorType}`, `When writing for a ${country} ${vendorType} firm, you MUST follow these rules exactly.`, 'State each regulatory fact, body name, or statutory figure ONCE. Do not repeat the same fact in multiple sections — repetition risks inconsistency.'];

  for (const row of allRows) {
    const local = isWales ? row.wales : isScotland ? row.scotland : isEngland ? row.england : null;
    if (!local) continue;

    L.push('');
    L.push(`### ${row.id.replace(/_/g, ' ').toUpperCase()}`);
    if (local.canonical) L.push(`Use: "${local.canonical}"`);
    if (local.occupantTerm) L.push(`Occupant term: "${local.occupantTerm}" (not "tenant")`);
    if (local.noticeProvision) L.push(`Notice provision: ${local.noticeProvision}`);

    const forbidden = isWales ? row.forbiddenInWales : isScotland ? row.forbiddenInScotland : row.forbiddenInEngland;
    if (forbidden?.length) L.push(`NEVER use: ${forbidden.join(', ')}`);

    if (isWales && row.requiredInWales?.length) {
      L.push(`MUST appear when the topic touches ${row.domain || 'this area'}: ${row.requiredInWales.join(', ')}`);
    }

    if (row.englandOnly && isWales) L.push(`"${row.id.replace(/_/g, ' ')}" does NOT apply in ${country} — omit entirely.`);
  }

  const statuteRows = factsFor(vendorType, 'statute');
  for (const row of statuteRows) {
    if (row.correctAct) {
      L.push('');
      L.push(`### ${row.id.replace(/_/g, ' ').toUpperCase()}`);
      L.push(`Correct statute: "${row.correctAct}"`);
      if (row.wrongActs?.length) L.push(`Do NOT cite: ${row.wrongActs.join(', ')}`);
      if (row.note) L.push(`Note: ${row.note}`);
    }
  }

  return L.join('\n');
}
