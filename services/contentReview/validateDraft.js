import { resolveJurisdiction } from '../../lib/config/jurisdictions.js';
import { profileFor } from '../../lib/config/industryProfiles.js';
import { factsFor, isRowVerified } from '../../lib/config/jurisdictionFacts.js';
import { isDemoFirm } from '../../lib/config/demoVendors.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CONTRAST_MARKER = /\b(?:not|unlike|rather than|instead of|whereas|as opposed to|by contrast|in contrast|differs? from|does ?n[o']?t apply|do ?n[o']?t apply|no longer applies?|applies?(?: only)? in england|england only|in england\b|english law|under english law)\b/i;

function hasContrastNear(text, idx, span = 110) {
  const window = text.substring(Math.max(0, idx - span), Math.min(text.length, idx + span));
  return CONTRAST_MARKER.test(window);
}

function anyPresent(text, signals) {
  const t = (text || '').toLowerCase();
  return signals.some(s => s && t.includes(String(s).toLowerCase()));
}

function lettingWelshSignals(row) {
  const w = row.wales || {};
  return [
    w.canonical, w.occupantTerm, w.noticeProvision,
    ...(row.requiredInWales || []),
    'Renting Homes (Wales) Act', 'Renting Homes (Fees', 'occupation contract',
    'contract-holder', 'Rent Smart Wales', 'Section 173', '(Wales) Act 2016',
    '(Wales) Act 2019',
  ].filter(Boolean);
}

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
  const correctSignals = [regime.taxName, regime.taxAbbrev, regime.authority, regime.authorityAbbrev].filter(Boolean);
  const jurisdictionAware = anyPresent(text, correctSignals);
  for (const term of regime.forbiddenTerms) {
    const m = new RegExp(`\\b${esc(term)}\\b`, 'i').exec(text);
    if (!m) continue;
    const aware = jurisdictionAware || hasContrastNear(text, m.index);
    if (aware) {
      out.push({
        severity: 'warn', code: 'TAX_JURISDICTION_CONTRAST_REVIEW',
        message: `Draft names "${term}" but also references the correct ${regime.country} regime (${regime.taxName} / ${regime.authority}). Treated as a deliberate contrast and passed to claim verification rather than hard-blocked.`,
      });
    } else {
      out.push({
        severity: 'block', code: 'WRONG_TAX_JURISDICTION',
        message: `Firm is in ${regime.country}; draft uses "${term}" with no correct-regime context. Correct: ${regime.taxName} (${regime.taxAbbrev}) / ${regime.authority}.`,
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
    if (forbidden) {
      const welshAware = anyPresent(text, lettingWelshSignals(row));
      for (const term of forbidden) {
        const m = new RegExp(`\\b${esc(term)}\\b`, 'i').exec(text);
        if (!m) continue;
        const correct = row.wales?.canonical || '(see jurisdictionFacts.js)';
        const aware = welshAware || hasContrastNear(text, m.index);
        if (aware) {
          out.push({
            severity: 'warn',
            code: 'LETTING_JURISDICTION_CONTRAST_REVIEW',
            message: `Draft names England-only term "${term}" (${row.id}) but also shows Welsh-law awareness (correct: ${correct}). Treated as a deliberate contrast and passed to claim verification rather than hard-blocked.`,
          });
        } else {
          out.push({
            severity: 'block',
            code: 'WRONG_LETTING_JURISDICTION',
            message: `Firm is in Wales; draft uses "${term}" (${row.id}) with no Welsh-law context. Correct: ${correct}.`,
          });
        }
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
    const correctPresent = row.correctAct ? anyPresent(text, [row.correctAct]) : false;
    for (const wrong of row.wrongActs) {
      const m = new RegExp(`\\b${esc(wrong)}\\b`, 'i').exec(text);
      if (!m) continue;
      const aware = correctPresent || hasContrastNear(text, m.index);
      if (aware) {
        out.push({
          severity: 'warn',
          code: 'STATUTE_CITATION_CONTRAST_REVIEW',
          message: `Draft names "${wrong}" in a redress context but also cites the correct statute (${row.correctAct}). Treated as a deliberate contrast and passed to claim verification rather than hard-blocked.`,
        });
      } else {
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
    ? [{ severity: 'warn', code: 'ADVICE_SHAPED_LANGUAGE', message: 'Advice-shaped language detected - review for FCA/regulatory financial-promotion risk before publishing.' }]
    : [];
}

function ruleDeprecatedSchema(text) {
  return /\b(FAQPage|HowTo)\b/.test(text)
    ? [{ severity: 'warn', code: 'DEPRECATED_SCHEMA', message: 'FAQPage/HowTo schema banned (Content OS 5.7).' }]
    : [];
}

const MEMBERSHIP_BODIES = [
  { re: 'NAEA(?:\\s+Propertymark)?', field: 'propertymarkNumber', label: 'NAEA / Propertymark' },
  { re: 'ARLA(?:\\s+Propertymark)?', field: 'propertymarkNumber', label: 'ARLA / Propertymark' },
  { re: 'Propertymark',              field: 'propertymarkNumber', label: 'Propertymark' },
  { re: 'RICS',  field: 'ricsNumber',      label: 'RICS' },
  { re: 'SRA',   field: 'sraNumber',       label: 'SRA' },
  { re: 'ICAEW', field: 'icaewFirmNumber', label: 'ICAEW' },
  { re: 'ACCA',  field: 'accaNumber',      label: 'ACCA' },
  { re: 'FCA',   field: 'fcaNumber',       label: 'FCA' },
];
const MEMBERSHIP_PREDICATE = /\b(?:member|members|membership|registered|registration|qualified|qualification|accredited|accreditation|regulated|certified)\b/i;
const MEMBERSHIP_FIRM_ATTRIB = /\b(?:we|we're|we are|our|us|the firm|this firm|our firm|the team|our team|our staff|the practice|our practice)\b/i;
const MEMBERSHIP_SELF_PEOPLE = 'staff|team|advisers?|advisors?|surveyors?|valuers?|negotiators?|agents|solicitors?|accountants?|consultants?';

function membershipFieldOnFile(firm, field) {
  return firm[field] || (firm.firmData && (firm.firmData[field]?.value || firm.firmData[field]));
}

function ruleUnverifiedMembershipClaim(text, firm) {
  const out = [];
  const seen = new Set();
  for (const body of MEMBERSHIP_BODIES) {
    const bodyRe = new RegExp(`\\b(?:${body.re})\\b`, 'gi');
    const construct1 = new RegExp(`(?:${body.re})[\\s-]?(?:qualified|registered|accredited|certified|regulated)\\s+(?:${MEMBERSHIP_SELF_PEOPLE})`, 'i');
    const construct2 = new RegExp(`(?:${MEMBERSHIP_SELF_PEOPLE})\\s+(?:are|is|being)\\s+(?:${body.re})[\\s-]?(?:qualified|registered|accredited|certified)`, 'i');
    let m;
    while ((m = bodyRe.exec(text)) !== null) {
      const idx = m.index;
      const window = text.substring(Math.max(0, idx - 90), Math.min(text.length, idx + 110));
      if (!MEMBERSHIP_PREDICATE.test(window)) continue;
      if (membershipFieldOnFile(firm, body.field)) continue;
      const firmAttributed = MEMBERSHIP_FIRM_ATTRIB.test(window);
      const selfPeople = construct1.test(window) || construct2.test(window);
      if (!firmAttributed && !selfPeople) continue;
      const key = body.field + ':' + Math.round(idx / 50);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ severity: 'block', code: 'UNVERIFIED_MEMBERSHIP_CLAIM',
        message: `Draft asserts ${body.label} membership/qualification for the firm, but no verified ${body.field} is on file. Add the verified number to the firm record or remove the claim.` });
    }
  }
  return out;
}

const RULES = [ruleJurisdiction, rulePlaceholderRegNumber, ruleUnverifiedRegNumber,
  ruleForeignRegulator, ruleLettingJurisdiction, ruleStatuteCitation,
  ruleVoluntaryBodyOverclaim, ruleCredentialExclusivity,
  ruleUnverifiedMembershipClaim,
  ruleAdviceLanguage, ruleDeprecatedSchema];

export function validateDraft(draftText, firm = {}) {
  const findings = RULES.flatMap(r => r(draftText || '', firm));
  const blocks = findings.filter(f => f.severity === 'block');
  return { ok: blocks.length === 0, blocks, warnings: findings.filter(f => f.severity === 'warn') };
}
