import { resolveJurisdiction } from '../../lib/config/jurisdictions.js';
import { profileFor } from '../../lib/config/industryProfiles.js';
import { factsFor } from '../../lib/config/jurisdictionFacts.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function ruleJurisdictionFacts(text, firm) {
  const out = [];
  const rows = factsFor(firm.vendorType);
  if (rows.length === 0) return out;

  const { regime } = resolveJurisdiction(firm);
  const country = regime?.country;
  const isWales = country === 'Wales';
  const isEngland = country === 'England';
  const isScotland = country === 'Scotland';

  if (!regime) {
    const anyTaxMention = /\b(SDLT|LTT|LBTT|stamp duty|land transaction tax|land and buildings transaction tax|HMRC|welsh revenue|revenue scotland|assured shorthold tenancy|AST|occupation contract|Section 21|Section 173|Rent Smart Wales)\b/i;
    if (anyTaxMention.test(text)) {
      out.push({ severity: 'block', code: 'TAX_REGIME_UNCONFIRMED', message: 'Jurisdiction-specific content present but firm jurisdiction is unconfirmed.' });
    }
    return out;
  }

  for (const row of rows) {
    const forbidden = isWales ? row.forbiddenInWales
      : isScotland ? row.forbiddenInScotland
      : isEngland ? row.forbiddenInEngland
      : null;
    if (!forbidden) continue;
    for (const term of forbidden) {
      if (new RegExp(`\\b${esc(term)}\\b`, 'i').test(text)) {
        const local = isWales ? row.wales : isScotland ? row.scotland : row.england;
        const correct = local?.canonical || '(check jurisdictionFacts.js)';
        const severity = row.domain === 'letting' ? 'warn' : 'block';
        out.push({
          severity,
          code: severity === 'block' ? 'WRONG_TAX_JURISDICTION' : 'WRONG_LETTING_JURISDICTION',
          message: `Firm is in ${country}; draft uses "${term}" (${row.id}). Correct: ${correct}.`,
        });
      }
    }

    if (isWales && row.englandOnly) {
      const engTerms = row.england?.canonical;
      if (engTerms && new RegExp(`\\b${esc(engTerms.split(' ')[0])}\\b`, 'i').test(text)) {
        out.push({
          severity: 'warn',
          code: 'ENGLAND_ONLY_CONCEPT_IN_WALES',
          message: `"${row.id}" does not apply in Wales — draft references it.`,
        });
      }
    }
  }

  return out;
}

function rulePlaceholderRegNumber(text) {
  return /\b(?:membership|registration|reg\.?|SRA|FCA|ICAEW|Propertymark)\s*(?:number|no\.?|id)?\s*[:#]?\s*(?:12345|123456|1234|00000|99999|11111|XXXXX)\b/i.test(text)
    ? [{ severity: 'block', code: 'PLACEHOLDER_REG_NUMBER', message: 'Placeholder registration number detected.' }]
    : [];
}

function ruleUnverifiedRegNumber(text, firm) {
  const prof = profileFor(firm.vendorType);
  if (!prof) return [];
  const re = new RegExp(`\\b(?:${esc(prof.regulator)}|membership)\\s+(?:registration\\s+)?(?:number|no\\.?)\\s*[:#]?\\s*(\\d{4,8})\\b`, 'i');
  const m = text.match(re);
  if (!m) return [];
  const onFile = firm[prof.numberField] || (firm.firmData && firm.firmData[prof.numberField]);
  if (!onFile) return [{ severity: 'block', code: 'UNVERIFIED_REG_NUMBER', message: `Draft states a ${prof.regulator} number but none is on file.` }];
  if (String(onFile) !== m[1]) return [{ severity: 'block', code: 'REG_NUMBER_MISMATCH', message: `Draft states ${prof.regulator} number ${m[1]}; on file is ${onFile}.` }];
  return [];
}

function ruleForeignRegulator(text, firm) {
  const prof = profileFor(firm.vendorType);
  if (!prof) return [];
  const out = [];
  const selfRef = "(?:we are|we're|our firm is|our practice is|this firm is|the firm is)\\s+(?:authorised and\\s+)?(?:regulated|registered|authorised)\\s+(?:by|with)\\s+(?:the\\s+)?";
  for (const bad of prof.foreign) {
    if (new RegExp(`${selfRef}${esc(bad)}\\b`, 'i').test(text)) {
      out.push({ severity: 'block', code: 'WRONG_REGULATOR', message: `Draft says the firm itself is regulated by ${bad}; this firm's regulator is ${prof.regulator}.` });
    }
  }
  return out;
}

function ruleAdviceLanguage(text, firm) {
  const prof = profileFor(firm.vendorType);
  if (!prof) return [];
  const advice = /\b(you should (?:choose|take|get|opt|apply)|we recommend you|you are entitled to|you qualify for|the best (?:mortgage|deal|product) for you)\b/i;
  return advice.test(text)
    ? [{ severity: 'warn', code: 'ADVICE_SHAPED_LANGUAGE', message: 'Advice-shaped language detected — review for FCA/regulatory financial-promotion risk before publishing.' }]
    : [];
}

function ruleDeprecatedSchema(text) {
  return /\b(FAQPage|HowTo)\b/.test(text)
    ? [{ severity: 'warn', code: 'DEPRECATED_SCHEMA', message: 'FAQPage/HowTo schema banned (Content OS 5.7).' }]
    : [];
}

const RULES = [ruleJurisdictionFacts, rulePlaceholderRegNumber, ruleUnverifiedRegNumber,
  ruleForeignRegulator, ruleAdviceLanguage, ruleDeprecatedSchema];

export function validateDraft(draftText, firm = {}) {
  const findings = RULES.flatMap(r => r(draftText || '', firm));
  const blocks = findings.filter(f => f.severity === 'block');
  return { ok: blocks.length === 0, blocks, warnings: findings.filter(f => f.severity === 'warn') };
}
