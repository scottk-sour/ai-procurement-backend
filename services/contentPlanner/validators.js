import { detectPossibleFabrication } from './writerGuards.js';

/**
 * Pre-publish validator for Writer Agent content drafts.
 *
 * Hard-block conditions reject the draft entirely (admin sees failure):
 *   - Unresolved [FIRM_DATA: ...] or [FIRM TO PROVIDE: ...] markers
 *   - US English spellings (forbidden by system prompt)
 *   - Banned AI phrases ("in today's fast-paced", "let's dive in", etc.)
 *
 * Soft-warn conditions attach metadata but do not block publish:
 *   - Statistics or currency values not near a recognised Tier 1 source name
 *
 * Pure functions — no DB access, no side effects.
 */

const PLACEHOLDER_PATTERN = /\[FIRM_DATA:|\[FIRM TO PROVIDE[: ]|\[[A-Z][A-Z_ ]+:\s[^\]]+\]/;

export const BANNED_PHRASES = [
  /\bin today'?s fast-paced\b/i,
  /\blet'?s dive in\b/i,
  /\bin conclusion\b/i,
  /\bit'?s worth noting\b/i,
  /\bit is important to note\b/i,
  /\bwithout further ado\b/i,
  /\bhave you ever wondered\b/i,
  /\bthat being said\b/i,
  /\bmoreover\b/i,
  /\bfurthermore\b/i,
  /\badditionally\b/i,
];

export const BANNED_PHRASE_WORDS = [
  'in today\'s fast-paced', 'let\'s dive in', 'in conclusion',
  'it\'s worth noting', 'it is important to note', 'without further ado',
  'have you ever wondered', 'that being said', 'moreover', 'furthermore', 'additionally',
];

export function repairContainsBannedPhrase(repairText) {
  if (!repairText) return false;
  return BANNED_PHRASES.some(p => p.test(repairText));
}

const US_ENGLISH_PATTERNS = [
  { pattern: /\boptimization\b/i, suggestion: 'optimisation' },
  { pattern: /\boptimize(d|s|r|rs)?\b/i, suggestion: 'optimise variants' },
  { pattern: /\bbehavior\b/i, suggestion: 'behaviour' },
  { pattern: /\bbehavioral\b/i, suggestion: 'behavioural' },
  { pattern: /\bcolor\b/i, suggestion: 'colour' },
  { pattern: /\bcolored\b/i, suggestion: 'coloured' },
  { pattern: /\borganization\b/i, suggestion: 'organisation' },
  { pattern: /\borganize(d|s|r|rs)?\b/i, suggestion: 'organise variants' },
  { pattern: /\bcentered\b/i, suggestion: 'centred' },
  { pattern: /\banalyze(d|s|r|rs)?\b/i, suggestion: 'analyse variants' },
  { pattern: /\brecognized\b/i, suggestion: 'recognised' },
  { pattern: /\brealize(d|s|r|rs)?\b/i, suggestion: 'realise variants' },
  { pattern: /\bspecialize(d|s|r|rs)?\b/i, suggestion: 'specialise variants' },
];

const BANNED_SUBSTITUTIONS = [
  { pattern: /\bIn today'?s fast-paced\b/gi, replacement: 'In the current' },
  { pattern: /\blet'?s dive in\b/gi, replacement: '' },
  { pattern: /\bIn conclusion,?\s*/gi, replacement: '' },
  { pattern: /\bIt'?s worth noting (that )?/gi, replacement: '' },
  { pattern: /\bIt is important to note (that )?/gi, replacement: '' },
  { pattern: /\bWithout further ado,?\s*/gi, replacement: '' },
  { pattern: /\bHave you ever wondered\b/gi, replacement: 'You may wonder' },
  { pattern: /\bThat being said,?\s*/gi, replacement: '' },
  { pattern: /\bMoreover,?\s*/gi, replacement: '' },
  { pattern: /\bFurthermore,?\s*/gi, replacement: '' },
  { pattern: /\bAdditionally,?\s*/gi, replacement: 'Also, ' },
];

const US_TO_UK_SUBSTITUTIONS = [
  { pattern: /\boptimization\b/gi, replacement: 'optimisation' },
  { pattern: /\boptimize\b/gi, replacement: 'optimise' },
  { pattern: /\boptimized\b/gi, replacement: 'optimised' },
  { pattern: /\boptimizes\b/gi, replacement: 'optimises' },
  { pattern: /\boptimizer\b/gi, replacement: 'optimiser' },
  { pattern: /\bbehavior\b/gi, replacement: 'behaviour' },
  { pattern: /\bbehavioral\b/gi, replacement: 'behavioural' },
  { pattern: /\bcolor\b/gi, replacement: 'colour' },
  { pattern: /\bcolored\b/gi, replacement: 'coloured' },
  { pattern: /\borganization\b/gi, replacement: 'organisation' },
  { pattern: /\borganize\b/gi, replacement: 'organise' },
  { pattern: /\borganized\b/gi, replacement: 'organised' },
  { pattern: /\borganizes\b/gi, replacement: 'organises' },
  { pattern: /\bcentered\b/gi, replacement: 'centred' },
  { pattern: /\banalyze\b/gi, replacement: 'analyse' },
  { pattern: /\banalyzed\b/gi, replacement: 'analysed' },
  { pattern: /\banalyzes\b/gi, replacement: 'analyses' },
  { pattern: /\brecognized\b/gi, replacement: 'recognised' },
  { pattern: /\brealize\b/gi, replacement: 'realise' },
  { pattern: /\brealized\b/gi, replacement: 'realised' },
  { pattern: /\brealizes\b/gi, replacement: 'realises' },
  { pattern: /\bspecialize\b/gi, replacement: 'specialise' },
  { pattern: /\bspecialized\b/gi, replacement: 'specialised' },
  { pattern: /\bspecializes\b/gi, replacement: 'specialises' },
];

export function autoCleanseDraft(text) {
  if (!text) return text;
  let result = text;
  for (const { pattern, replacement } of BANNED_SUBSTITUTIONS) {
    result = result.replace(pattern, replacement);
  }
  for (const { pattern, replacement } of US_TO_UK_SUBSTITUTIONS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n');
  return result;
}

const TIER_1_SOURCES = [
  'SRA', 'Solicitors Regulation Authority',
  'ICAEW', 'ACCA', 'AAT',
  'FCA', 'Financial Conduct Authority',
  'Propertymark', 'Property Ombudsman', 'TPO', 'PRS',
  'HM Land Registry', 'Land Registry',
  'HMRC', 'GOV.UK',
  'Companies House',
  'Office for National Statistics', 'ONS',
  'Bank of England',
  'TendorAI',
];

const STAT_PATTERN = /(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*%|£\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|m|bn|k))?/gi;

const PROXIMITY_WINDOW = 250;

/**
 * Count placeholder markers in a text string.
 * Matches both [FIRM_DATA: key | label] and legacy [FIRM TO PROVIDE: ...].
 */
export function countPlaceholders(text) {
  if (typeof text !== 'string') return 0;
  const keyed = text.match(/\[FIRM_DATA:[^\]]*\]/gi) || [];
  const legacy = text.match(/\[FIRM TO PROVIDE[: ][^\]]*\]/gi) || [];
  return keyed.length + legacy.length;
}

/**
 * Find statistics in text that are not within PROXIMITY_WINDOW characters
 * of any recognised Tier 1 source name.
 */
export function findUnsourcedStats(text) {
  if (typeof text !== 'string') return [];
  const stats = [...text.matchAll(STAT_PATTERN)];
  const unsourced = [];
  for (const match of stats) {
    const stat = match[0];
    const position = match.index;
    const windowStart = Math.max(0, position - PROXIMITY_WINDOW);
    const windowEnd = Math.min(text.length, position + stat.length + PROXIMITY_WINDOW);
    const surrounding = text.slice(windowStart, windowEnd);
    const hasNearbySource = TIER_1_SOURCES.some(src =>
      surrounding.toLowerCase().includes(src.toLowerCase())
    );
    if (!hasNearbySource) {
      unsourced.push({ stat, position });
    }
  }
  return unsourced;
}

/**
 * Validate a Writer Agent draft payload before publish.
 *
 * @param {object} payload - draftPayload from approval item
 * @param {string} payload.body - markdown blog body
 * @param {string} [payload.linkedInText] - LinkedIn variant
 * @param {string} [payload.facebookText] - Facebook variant
 * @returns {{ passed: boolean, errors: string[], warnings: string[] }}
 */
export function validateContentDraft(payload) {
  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== 'object') {
    return { passed: false, errors: ['payload missing or not an object'], warnings: [] };
  }

  const body = payload.body || '';
  const linkedInText = payload.linkedInText || '';
  const facebookText = payload.facebookText || '';

  if (!body.trim()) {
    errors.push('body is empty');
  }

  const allText = [body, linkedInText, facebookText].join('\n\n');

  if (PLACEHOLDER_PATTERN.test(allText)) {
    const count = countPlaceholders(allText);
    errors.push(`${count} unresolved placeholder(s) found — must be filled before publish`);
  }

  for (const pattern of BANNED_PHRASES) {
    const match = allText.match(pattern);
    if (match) {
      errors.push(`Banned phrase: "${match[0]}"`);
    }
  }

  for (const { pattern, suggestion } of US_ENGLISH_PATTERNS) {
    const match = allText.match(pattern);
    if (match) {
      errors.push(`US English spelling "${match[0]}" — use ${suggestion}`);
    }
  }

  const unsourced = findUnsourcedStats(allText);
  if (unsourced.length > 0) {
    warnings.push(
      `${unsourced.length} statistic(s) without a nearby Tier 1 source: ${unsourced.map(u => u.stat).slice(0, 5).join(', ')}${unsourced.length > 5 ? '...' : ''}`
    );
  }

  // Hard-block fabricated statistics attributed to a named body (Rule 20/23),
  // across all verticals. Promotes the existing detector from a generation-time
  // warning to a publish-blocking error.
  const fabricated = detectPossibleFabrication(allText);
  for (const f of fabricated) {
    errors.push(`Fabricated statistic attributed to ${f.body}: "${f.excerpt.trim()}"`);
  }

  // Firm performance claims are now checked semantically via Haiku at publish-time
  // (in approvalQueue.js content_draft handler), not by the deterministic regex here.
  // The regex detectFirmPerformanceClaims was removed from the publish path because
  // it false-positived on generic process descriptions, markdown tables, and years.

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
