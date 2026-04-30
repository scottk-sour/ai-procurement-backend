/**
 * Pre-publish validator for Writer Agent content drafts.
 *
 * Hard-block conditions reject the draft entirely (admin sees failure):
 *   - Unresolved [FIRM TO PROVIDE: ...] markers
 *   - US English spellings (forbidden by system prompt)
 *   - Banned AI phrases ("in today's fast-paced", "let's dive in", etc.)
 *
 * Soft-warn conditions attach metadata but do not block publish:
 *   - Statistics or currency values not near a recognised Tier 1 source name
 *
 * Pure functions — no DB access, no side effects.
 */

const PLACEHOLDER_PATTERN = /\[FIRM TO PROVIDE[: ]/i;

const BANNED_PHRASES = [
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
 * Count [FIRM TO PROVIDE: ...] markers in a text string.
 */
export function countPlaceholders(text) {
  if (typeof text !== 'string') return 0;
  const matches = text.match(/\[FIRM TO PROVIDE[: ]/gi);
  return matches ? matches.length : 0;
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
    errors.push(`${count} unresolved [FIRM TO PROVIDE: ...] marker(s) found — must be filled before publish`);
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

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
