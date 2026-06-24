import { resolveJurisdiction } from '../../lib/config/jurisdictions.js';
import { profileFor } from '../../lib/config/industryProfiles.js';
import { factsFor, isRowVerified } from '../../lib/config/jurisdictionFacts.js';
import { isDemoFirm } from '../../lib/config/demoVendors.js';

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

function rulePlaceholderRegNumber(text, firm) {
  if (isDemoFirm(firm)) return [];

  if (/\b(?:membership|registration|reg\.?|SRA|FCA|ICAEW|Propertymark)\s*(?:number|no\.?|id)?\s*[:#]?\s*(?:12345|123456|1234|00000|99999|11111|XXXXX)\b/i.test(text)) {
    return [{ severity: 'block', code: 'PLACEHOLDER_REG_NUMBER', message: 'Placeholder registration number detected.' }];
  }

  if (/\b(?:PM|SRA|FCA|FRN|ICAEW|RICS|REG)[-\s](?:DEMO|TEST|SAMPLE|PLACEHOLDER|EXAMPLE)\b/i.test(text)) {
    return [{ severity: 'block', code: 'PLACEHOLDER_REG_NUMBER', message: 'Placeholder registration token detected.' }];
  }

  if (/\b(?:DEMO|TEST|SAMPLE|PLACEHOLDER)[-\s]\d{1,6}\b/i.test(text)) {
    return [{ severity: 'block', code: 'PLACEHOLDER_REG_NUMBER', message: 'Placeholder registration token detected.' }];
  }

  return [];
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

function ruleStatuteCitation(text, firm) {
  const out = [];
  const rows = factsFor(firm.vendorType, 'statute');
  for (const row of rows) {
    if (!isRowVerified(row)) continue;
    if (!row.claimSignals || !row.wrongActs) continue;
    const hasSignal = row.claimSignals.some(s => new RegExp(`\\b${esc(s)}\\b`, 'i').test(text));
    if (!hasSignal) continue;
    for (const wrong of row.wrongActs) {
      if (new RegExp(`\\b${esc(wrong)}\\b`, 'i').test(text)) {
        out.push({
          severity: 'block',
          code: 'WRONG_STATUTE_CITATION',
          message: `Draft cites "${wrong}" in a redress context. The correct statute is ${row.correctAct}.`,
        });
      }
    }
  }
  return out;
}

function ruleVoluntaryBodyOverclaim(text, firm) {
  if (firm.vendorType !== 'estate-agent') return [];
  if (/\b(?:regulated qualification|statutory qualification|legally required qualification|mandatory qualification|not a self[-\s]?awarded)\b/i.test(text)) {
    return [{ severity: 'block', code: 'VOLUNTARY_BODY_OVERCLAIM', message: 'Propertymark membership is voluntary, not a regulated or statutory qualification. Reword to avoid implying it is mandatory or government-regulated.' }];
  }
  return [];
}

function ruleCredentialExclusivity(text, firm) {
  if (firm.vendorType !== 'estate-agent') return [];
  const cmpPhrases = /\b(?:client money protection|CMP)\b/i;
  const exclusivity = /\b(?:only|unique to|exclusive to|removes that risk|the only way|sole provider of)\b/i;
  if (!cmpPhrases.test(text)) return [];
  const cmpMatch = text.match(cmpPhrases);
  if (!cmpMatch) return [];
  const idx = cmpMatch.index;
  const window = text.substring(Math.max(0, idx - 60), Math.min(text.length, idx + 80));
  if (exclusivity.test(window) || /\bPropertymark['']?s?\s+(?:mandatory|compulsory|required)\s+(?:CMP|client money)\b/i.test(text)) {
    return [{ severity: 'warn', code: 'CREDENTIAL_EXCLUSIVITY_FRAMING', message: 'CMP/redress framed as Propertymark-exclusive. CMP is available from multiple providers; redress scheme membership is required by law for all agents.' }];
  }
  return [];
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
  ruleForeignRegulator, ruleLettingJurisdiction, ruleStatuteCitation,
  ruleVoluntaryBodyOverclaim, ruleCredentialExclusivity,
  ruleAdviceLanguage, ruleDeprecatedSchema];

export function validateDraft(draftText, firm = {}) {
  const findings = RULES.flatMap(r => r(draftText || '', firm));
  const blocks = findings.filter(f => f.severity === 'block');
  return { ok: blocks.length === 0, blocks, warnings: findings.filter(f => f.severity === 'warn') };
}
