/**
 * Experiment mention matcher — detects whether a firm is named in an AI response.
 *
 * Uses the same normalisation approach as the production nameMatch.js but
 * adapted for experiment targets where we check multiple firm names against
 * a single response text. Guards against false positives from short/common
 * words by requiring multi-token names to appear as a contiguous phrase and
 * single-token names to appear (at a word boundary) as their RETAINED-SUFFIX
 * form — the fully-stripped name plus its last generic ending word. The
 * single-token rule is RETAINED-SUFFIX, selected by the EXP-001 six-rule scoring.
 */

export const SUFFIX_RE = /[\s,.]+(?:ltd|limited|llp|plc|pvt|co|company|uk|inc|incorporated|corp|corporation|group|holdings|services|solutions|solicitors?|law|legal|practice|associates?|partners?|(?:&\s*|and\s+)co|(?:&\s*|and\s+)sons)\.?$/i;

export function stripDiacritics(s) {
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

/**
 * Retained-suffix form of a firm name: normaliseFirmName's pipeline, but the
 * suffix-stripping loop stops ONE productive pass before the fully-stripped
 * result, so exactly one generic ending word is retained. Uses this module's
 * own SUFFIX_RE and stripDiacritics — the single source of truth for suffix
 * stripping (no copy, no second regex).
 *
 *   ALL LAW LIMITED               -> "all law"                (fully-stripped "all")
 *   BEST SOLICITORS LIMITED       -> "best solicitors"        (fully-stripped "best")
 *   YORKSHIRE LEGAL LIMITED       -> "yorkshire legal"        (fully-stripped "yorkshire")
 *   WAKE SMITH SOLICITORS LIMITED -> "wake smith solicitors"  (fully-stripped "wake smith")
 *
 * Because SUFFIX_RE requires a leading [\s,.]+, the FIRST token never strips and
 * the loop never reaches empty. No strippable suffix -> the retained form equals
 * the fully-stripped form. A "suffix-only"-looking name keeps its first token:
 * "LAW LIMITED" -> fully-stripped "law", retained "law limited" (not empty, not
 * a bare "law").
 */
export function retainedSuffixForm(firmName) {
  if (!firmName) return '';
  let s = stripDiacritics(firmName)
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  // Mirror normaliseFirmName's loop, capturing the value one productive pass
  // before the final fully-stripped form.
  let beforeLast = s;
  let prev;
  do {
    prev = s;
    const next = s.replace(SUFFIX_RE, '').trim();
    if (next === prev) break;   // no change: the loop stops here (as normaliseFirmName does)
    beforeLast = prev;          // prev is the value one strip before `next`
    s = next;
  } while (s.length > 0);
  return beforeLast
    .replace(/[.,;:()'"\[\]{}!?*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  if (!normFirm) return false;

  const tokens = normFirm.split(/\s+/).filter(t => t.length > 0);

  if (tokens.length >= 2) {
    // Multi-token path — unchanged: require the normalised name as a contiguous
    // substring of the normalised response.
    return normText.includes(normFirm);
  }

  // Single-token path — RETAINED-SUFFIX (selected by the EXP-001 six-rule
  // scoring; total errors 30 at the pre-registered lower bound). Match the
  // retained-suffix form (the fully-stripped name plus its last generic ending
  // word) at a word boundary. This deliberately does NOT match a single-token
  // firm named without its suffix word (e.g. "Howells" alone for "Howells
  // Solicitors"); that miss is the accepted cost of a far lower false-positive
  // rate on place names and generic words. The only length check on this path is
  // a 3-character minimum on the retained form: no context gate, no acronym
  // exception, no additional single-token length floor. Uses retainedSuffixForm
  // (SUFFIX_RE-based), not the bare normaliseFirmName token.
  const retained = retainedSuffixForm(firmName);
  if (!retained || retained.length < 3) return false;
  const escaped = retained.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(normText);
}

export function checkTargetMentions(responseText, targets) {
  return targets.map(t => ({
    ...t,
    mentioned: isFirmMentioned(responseText, t.entityName),
  }));
}
