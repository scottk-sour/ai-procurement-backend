/**
 * Experiment mention matcher — detects whether a firm is named in an AI response.
 *
 * Uses the same normalisation approach as the production nameMatch.js but
 * adapted for experiment targets where we check multiple firm names against
 * a single response text. Guards against false positives from short/common
 * words by requiring multi-token names to appear as a contiguous phrase and
 * single-token names to appear at a word boundary in a firm-reference context
 * (e.g. preceded by a number, bullet, or start of line).
 */

const SUFFIX_RE = /[\s,.]+(?:ltd|limited|llp|plc|pvt|co|company|uk|inc|incorporated|corp|corporation|group|holdings|services|solutions|solicitors?|law|legal|practice|associates?|partners?|(?:&\s*|and\s+)co|(?:&\s*|and\s+)sons)\.?$/i;

function stripDiacritics(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '');
}

export function normaliseFirmName(name) {
  if (!name) return '';
  let s = stripDiacritics(name)
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  let prev;
  do { prev = s; s = s.replace(SUFFIX_RE, '').trim(); } while (s !== prev && s.length > 0);
  s = s.replace(/[.,;:()'"\[\]{}!?*#]/g, ' ').replace(/\s+/g, ' ').trim();
  return s || name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normaliseResponseText(text) {
  if (!text) return '';
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\*\*/g, '')
    .replace(/[.,;:()'"\[\]{}!?*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isFirmMentioned(responseText, firmName) {
  if (!responseText || !firmName) return false;

  const normText = normaliseResponseText(responseText);
  const normFirm = normaliseFirmName(firmName);

  if (!normFirm || normFirm.length < 3) return false;

  const tokens = normFirm.split(/\s+/).filter(t => t.length > 0);

  if (tokens.length >= 2) {
    return normText.includes(normFirm);
  }

  // Single-token firm name — require it appears in a firm-reference context:
  // preceded by a list marker, number, or near other firm-like tokens, not
  // just as a common word in prose. Accept 3-char tokens if they look like
  // acronyms (all-caps in the original name).
  const token = tokens[0];
  const firstWord = firmName.trim().split(/\s+/)[0] || '';
  const isAcronym = /^[A-Z]{2,}$/.test(firstWord);
  if (token.length < 3 || (token.length < 4 && !isAcronym)) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Must appear after a list marker (1. / - / •), bold markers, or at line start
  const contextRe = new RegExp(`(?:^|\\n|\\d+[.)\\s]|[-•*]\\s|\\*\\*\\s*)${escaped}\\b`, 'm');
  return contextRe.test(normText);
}

export function checkTargetMentions(responseText, targets) {
  return targets.map(t => ({
    ...t,
    mentioned: isFirmMentioned(responseText, t.entityName),
  }));
}
