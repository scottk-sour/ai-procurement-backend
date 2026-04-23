/**
 * Company-name matching helpers shared by platform response parsing and
 * competitor aggregation. The real detector's Places lookup (PR #30) already
 * normalizes company names to handle suffix and unicode variation; this module
 * extends the same approach to AI-platform output so that:
 *
 *   1. A firm is detected as "mentioned" even when the AI writes their name
 *      with a different suffix ("Celtic Frozen Drinks Ltd" vs "Celtic Frozen
 *      Drinks"), different case, stray punctuation, or diacritics.
 *   2. The firm is excluded from its own competitor list via the same
 *      normalized comparison.
 *   3. If the AI only cites the firm's URL (common with Perplexity), a
 *      domain-token match still counts as a mention.
 */

// Trailing UK / international company-form suffixes. Matched at end of name
// only — "Sons of Anarchy" stays intact but "Smith & Sons Ltd" → "Smith".
// Kept in sync with googleBusinessProfile.js, with a few extras added for AI
// output variation (Group, Holdings, Services, Corp, etc.).
const COMPANY_SUFFIX_RE = /[\s,.]+(?:ltd|limited|llp|plc|pvt|co|company|uk|inc|incorporated|corp|corporation|group|holdings|services|solutions|gmbh|bv|sa|srl|(?:&\s*|and\s+)co|(?:&\s*|and\s+)sons)\.?$/i;

function stripDiacritics(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Normalize a company name for comparison: lowercase, strip diacritics, strip
 * punctuation, collapse whitespace, iteratively strip trailing company-form
 * suffixes. Empty input returns ''. Input that is entirely a suffix (unlikely
 * but possible) falls back to the lowercased original so we never produce a
 * zero-length token that matches every string.
 */
export function normalizeCompanyName(name) {
  if (!name) return '';
  const raw = String(name);
  let s = stripDiacritics(raw)
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  let prev;
  do {
    prev = s;
    s = s.replace(COMPANY_SUFFIX_RE, '').trim();
  } while (s !== prev && s.length > 0);
  s = s.replace(/[.,;:()'"\[\]{}!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s) return s;
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeText(text) {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/[.,;:()'"\[\]{}!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract hostname-shaped tokens from a URL so we can match a firm when the
 * AI cites their website instead of naming them. Returns at most two tokens:
 * the full bare hostname and the label-without-TLD, both lowercased. Tokens
 * of length < 5 are dropped to avoid false positives from very short domains
 * (".co.uk" etc. are stripped anyway, but common words like "abc" are not
 * specific enough to key a mention on).
 */
export function extractDomainTokens(url) {
  if (!url) return [];
  const raw = String(url).trim();
  if (!raw) return [];
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  let host;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    host = raw.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0];
  }
  host = host.replace(/^www\./i, '').toLowerCase();
  const labels = host.split('.').filter(Boolean);
  if (labels.length === 0) return [];
  const tokens = new Set();
  if (host.length >= 5) tokens.add(host);
  if (labels.length >= 2) {
    const withoutTld = labels.slice(0, -1).join('.');
    if (withoutTld.length >= 5) tokens.add(withoutTld);
    const first = labels[0];
    if (first.length >= 5) tokens.add(first);
  }
  return [...tokens];
}

/**
 * True if `text` mentions `companyName`, using normalized substring matching
 * plus an optional URL-citation fallback. Does NOT check for negation context
 * — callers that care about "I could not find X" style false positives still
 * need to run their own sentiment check on the snippet (see
 * isPositiveMention in prompt.js).
 */
export function isCompanyMentioned(text, companyName, websiteUrl = null) {
  if (!text || !companyName) return false;
  const textNorm = normalizeText(text);
  if (!textNorm) return false;

  const companyNorm = normalizeCompanyName(companyName);
  if (companyNorm && textNorm.includes(companyNorm)) return true;

  // Safety net: a firm whose entire name normalizes to nothing (pathological,
  // e.g. pure punctuation) would otherwise match every string above.
  // normalizeCompanyName guards against empty output, but we still check the
  // raw lowercased form in case the suffix strip ate something meaningful.
  const rawLower = String(companyName).toLowerCase().trim();
  if (rawLower && rawLower !== companyNorm && textNorm.includes(normalizeText(rawLower))) {
    return true;
  }

  for (const token of extractDomainTokens(websiteUrl)) {
    if (textNorm.includes(token)) return true;
  }

  return false;
}

/**
 * True if `candidateName` refers to the same firm as `companyName`. Used to
 * filter the firm out of their own competitor list. Normalized equality plus
 * substring-either-direction handles the common cases:
 *   - "Celtic Frozen Drinks" vs "Celtic Frozen Drinks Ltd"  → same
 *   - "Nutrivend" vs "Nutrivend Group Limited"              → same
 *   - "Smith Solicitors" vs "Smith & Jones Solicitors"      → NOT same
 */
export function isSameFirm(candidateName, companyName) {
  if (!candidateName || !companyName) return false;
  const a = normalizeCompanyName(candidateName);
  const b = normalizeCompanyName(companyName);
  if (!a || !b) return false;
  if (a === b) return true;
  // Substring either direction — handles suffix-only differences without
  // matching arbitrary word overlaps (we do not split on whitespace).
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

/**
 * True if a candidate website belongs to the same domain as the searched
 * firm's website. Both inputs may be bare hostnames or full URLs. Only the
 * registrable portion is compared so "celticfrozendrinks.co.uk" matches
 * "www.celticfrozendrinks.co.uk/about".
 */
export function isSameDomain(candidateUrl, firmUrl) {
  const a = extractDomainTokens(candidateUrl);
  const b = extractDomainTokens(firmUrl);
  if (a.length === 0 || b.length === 0) return false;
  const aSet = new Set(a);
  return b.some((token) => aSet.has(token));
}
