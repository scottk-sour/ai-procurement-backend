import { resolveJurisdiction } from '../../lib/config/jurisdictions.js';
import { profileFor } from '../../lib/config/industryProfiles.js';
import { factsFor } from '../../lib/config/jurisdictionFacts.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function ruleJurisdiction(text, firm) {
  const out = [];
  const prof = profileFor(firm.vendorType);
  if (!prof || !prof.touchesPropertyTax) return out;
  const { regime } = resolveJurisdiction(firm);
  const taxMention = /\b(SDLT|LTT|LBTT|stamp duty|land transaction tax|land and buildings transaction tax|HMRC|welsh revenue|revenue scotland)\b/i;
  if (!regime) {
    if (taxMention.test(text)) out.push({ severity: 'block', code: 'TAX_REGIME_UNCONFIRMED', message: 'Tax content present but firm jurisdiction is unconfirmed.' });
    return out;
  }
  for (const term of regime.forbiddenTerms) {
    if (new RegExp(`\\b${esc(term)}\\b`, 'i').test(text)) {
      out.push({
        severity: 'block', code: 'WRONG_TAX_JURISDICTION',
        message: `Firm is in ${regime.country}; draft uses "${term}". Correct: ${regime.taxName} (${regime.taxAbbrev}) / ${regime.authority}.`,
      });
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

function ruleLettingJurisdiction(text, firm) {
  const out = [];
  const rows = factsFor(firm.vendorType, 'letting');
  if (rows.length === 0) return out;

  const { regime } = resolveJurisdiction(firm);
  if (!regime || regime.country !== 'Wales') return out;

  for (const row of rows) {
    const forbidden = row.forbiddenInWales;
    if (!forbidden) continue;
    for (const term of forbidden) {
      if (new RegExp(`\\b${esc(term)}\\b`, 'i').test(text)) {
        const correct = row.wales?.canonical || '(see jurisdictionFacts.js)';
        out.push({
          severity: 'block',
          code: 'WRONG_LETTING_JURISDICTION',
          message: `Firm is in Wales; draft uses "${term}" (${row.id}). Correct: ${correct}.`,
        });
      }
    }

    if (row.requiredInWales) {
      const lettingSignals = /\b(landlord|tenant|tenancy|letting|rent|deposit|eviction|possession|occupat)/i;
      if (lettingSignals.test(text)) {
        for (const req of row.requiredInWales) {
          if (!new RegExp(`\\b${esc(req)}\\b`, 'i').test(text)) {
            out.push({
              severity: 'block',
              code: 'MISSING_REQUIRED_LETTING_TERM',
              message: `Welsh letting content must mention "${req}" but it is absent.`,
            });
          }
        }
      }
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

const RULES = [ruleJurisdiction, rulePlaceholderRegNumber, ruleUnverifiedRegNumber,
  ruleForeignRegulator, ruleLettingJurisdiction, ruleAdviceLanguage, ruleDeprecatedSchema];

export function validateDraft(draftText, firm = {}) {
  const findings = RULES.flatMap(r => r(draftText || '', firm));
  const blocks = findings.filter(f => f.severity === 'block');
  return { ok: blocks.length === 0, blocks, warnings: findings.filter(f => f.severity === 'warn') };
}
