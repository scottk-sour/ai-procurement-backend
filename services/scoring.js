/**
 * Dual scoring for AEO reports.
 *
 * Two deterministic 0-100 scores computed from signals the detector + GBP/
 * Places + platform queries already gather:
 *
 *   - Technical Health (8 signals) tracks SEMrush/Searchable-style basics
 *   - AI Visibility (7 signals) covers AI-era signals
 *
 * No LLM calls. Every bucket comes from a deterministic check or API
 * response. Replaces the fabricated scoring prose in aeoReportGenerator.js.
 *
 * Feature flag: DUAL_SCORING (default TRUE). Flip to 'false' in Render env
 * to revert responses to legacy single-score fields — see
 * isDualScoringEnabled(). The flag is a rollback lever, not a rollout
 * stage — new reports should ship with dual scoring live by default.
 */

/**
 * DUAL_SCORING flag reader. Undefined, null, empty, or any non-'false' value
 * resolves to enabled. Only a literal 'false' (case-insensitive, trimmed)
 * disables it.
 */
export function isDualScoringEnabled() {
  const raw = process.env.DUAL_SCORING;
  if (raw === undefined || raw === null) return true;
  return String(raw).trim().toLowerCase() !== 'false';
}

const TECH_WEIGHTS = Object.freeze({
  ssl: 15,
  viewport: 10,
  meta: 17,
  h1: 10,
  schema: 13,
  social: 10,
  contact: 11,
  content: 14,
});

const AI_WEIGHTS = Object.freeze({
  faqSchema: 15,
  localBusiness: 15,
  blog: 10,
  gbp: 15,
  reviews: 15,
  placesListing: 10,
  aiMentions: 20,
});

export function bandForTechnicalHealth(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs Work';
  return 'Critical';
}

export function bandForAiVisibility(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  if (score >= 70) return 'Strong';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'Early Stage';
  return 'Starting Out';
}

function checkByKey(detector, key) {
  if (!detector || !Array.isArray(detector.checks)) return null;
  return detector.checks.find((c) => c.key === key) || null;
}

function scaleCheck(detector, key, weight) {
  const c = checkByKey(detector, key);
  if (!c || typeof c.score !== 'number') return 0;
  const max = typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10;
  const raw = Math.max(0, Math.min(max, c.score));
  return Math.round((raw / max) * weight);
}

/**
 * Compute Technical Health from detector output. Drops the "speed" signal
 * (HTML byte size penalises SSR frameworks unfairly); redistributes its
 * weight per TECH_WEIGHTS (summing to 100).
 */
export function computeTechnicalHealth(detector) {
  if (!detector || !Array.isArray(detector.checks)) {
    return { score: null, band: null, breakdown: null };
  }

  const breakdown = {
    ssl: scaleCheck(detector, 'ssl', TECH_WEIGHTS.ssl),
    viewport: scaleCheck(detector, 'viewport', TECH_WEIGHTS.viewport),
    meta: scaleCheck(detector, 'meta', TECH_WEIGHTS.meta),
    h1: scaleCheck(detector, 'h1', TECH_WEIGHTS.h1),
    schema: scaleCheck(detector, 'schema', TECH_WEIGHTS.schema),
    social: scaleCheck(detector, 'social', TECH_WEIGHTS.social),
    contact: scaleCheck(detector, 'contact', TECH_WEIGHTS.contact),
    content: scaleCheck(detector, 'content', TECH_WEIGHTS.content),
  };

  const score = Math.max(
    0,
    Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)),
  );
  return { score, band: bandForTechnicalHealth(score), breakdown };
}

function typeIs(typeField, wanted) {
  const w = wanted.toLowerCase();
  if (typeof typeField === 'string') return typeField.toLowerCase() === w;
  if (Array.isArray(typeField)) {
    return typeField.some((t) => typeof t === 'string' && t.toLowerCase() === w);
  }
  return false;
}

function hasFaqPageSchema(detector) {
  const payloads = Array.isArray(detector?.jsonLdPayloads) ? detector.jsonLdPayloads : [];
  return payloads.some((p) => typeIs(p?.['@type'], 'FAQPage'));
}

// Any @type that indicates a LocalBusiness or Organization entity. The spec
// has ~50 LocalBusiness subtypes (LegalService, AccountingService,
// RealEstateAgent, FinancialService, …) — match by substring so we accept
// any of them without hardcoding every one.
const LB_TYPE_SUBSTRINGS = [
  'organization',
  'localbusiness',
  'legalservice',
  'accountingservice',
  'realestateagent',
  'financialservice',
  'professionalservice',
];

function isLocalBusinessLike(typeField) {
  const fields = typeof typeField === 'string' ? [typeField]
    : Array.isArray(typeField) ? typeField
    : [];
  for (const t of fields) {
    if (typeof t !== 'string') continue;
    const low = t.toLowerCase();
    if (LB_TYPE_SUBSTRINGS.some((s) => low.includes(s))) return true;
  }
  return false;
}

const LB_REQUIRED_FIELDS = ['name', 'url', 'address', 'telephone', 'image'];

function gradeLocalBusinessRichness(detector) {
  const payloads = Array.isArray(detector?.jsonLdPayloads) ? detector.jsonLdPayloads : [];
  let best = 0;
  for (const p of payloads) {
    if (!isLocalBusinessLike(p?.['@type'])) continue;
    let have = 0;
    for (const field of LB_REQUIRED_FIELDS) {
      const v = p?.[field];
      if (v !== undefined && v !== null && v !== '') have += 1;
    }
    const ratio = have / LB_REQUIRED_FIELDS.length;
    if (ratio > best) best = ratio;
  }
  return best;
}

/**
 * Banded grading of Google Reviews (count × average rating).
 * Returns 0.0–1.0, scaled against AI_WEIGHTS.reviews by the caller.
 */
function gradeReviews(reviews) {
  if (!reviews || reviews.state !== 'pass') return 0;
  const count = typeof reviews.count === 'number' ? reviews.count : 0;
  const rating = typeof reviews.rating === 'number' ? reviews.rating : 0;
  if (count >= 50 && rating >= 4.5) return 1.0;
  if (count >= 25 && rating >= 4.5) return 0.85;
  if (count >= 25 && rating >= 4.0) return 0.7;
  if (count >= 10 && rating >= 4.0) return 0.55;
  if (count >= 5 && rating >= 3.5) return 0.35;
  if (count >= 3 && rating >= 3.0) return 0.2;
  return 0;
}

function gradeGbp(gbp) {
  if (!gbp) return 0;
  if (gbp.state === 'pass') return 1.0;
  if (gbp.state === 'amber') return 10 / 15;
  return 0;
}

function gradePlacesListing(listing) {
  if (!listing) return 0;
  if (listing.state === 'pass') return 1.0;
  if (listing.state === 'amber') return 0.6;
  return 0;
}

function gradeAiMentions(platformResults) {
  if (!Array.isArray(platformResults) || platformResults.length === 0) return 0;
  const valid = platformResults.filter(
    (p) => p && !p.error && p.mentioned !== null && p.mentioned !== undefined,
  );
  if (valid.length === 0) return 0;
  const hits = valid.filter((p) => p.mentioned === true).length;
  return hits / valid.length;
}

/**
 * Compute AI Visibility from detector + GBP + reviews + Places listing +
 * platform mention results.
 *
 * When the vendor type has no Places category mapping, `placesListing.state`
 * is 'skipped' — its 10 points are redistributed proportionally across the
 * other six signals so the 0-100 ceiling is preserved.
 */
export function computeAiVisibility(detector, gbp, reviews, placesListing, platformResults) {
  if (!detector || !Array.isArray(detector.checks)) {
    return { score: null, band: null, breakdown: null };
  }

  const faqFrac = hasFaqPageSchema(detector) ? 1 : 0;
  const lbFrac = gradeLocalBusinessRichness(detector);
  const blogFrac = detector?.blogDetection?.hasBlog ? 1 : 0;
  const gbpFrac = gradeGbp(gbp);
  const reviewFrac = gradeReviews(reviews);
  const aiFrac = gradeAiMentions(platformResults);

  const placesSkipped = placesListing?.state === 'skipped';
  const placesFrac = placesSkipped ? 0 : gradePlacesListing(placesListing);

  const weights = { ...AI_WEIGHTS };
  if (placesSkipped) {
    const extra = weights.placesListing;
    const keys = Object.keys(weights).filter((k) => k !== 'placesListing');
    const totalOther = keys.reduce((a, k) => a + weights[k], 0);
    for (const k of keys) {
      weights[k] = weights[k] + (weights[k] / totalOther) * extra;
    }
    weights.placesListing = 0;
  }

  const breakdown = {
    faqSchema: Math.round(faqFrac * weights.faqSchema),
    localBusiness: Math.round(lbFrac * weights.localBusiness),
    blog: Math.round(blogFrac * weights.blog),
    gbp: Math.round(gbpFrac * weights.gbp),
    reviews: Math.round(reviewFrac * weights.reviews),
    placesListing: Math.round(placesFrac * weights.placesListing),
    aiMentions: Math.round(aiFrac * weights.aiMentions),
  };

  const score = Math.max(
    0,
    Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)),
  );

  return {
    score,
    band: bandForAiVisibility(score),
    breakdown,
    placesSkipped,
  };
}

export default {
  isDualScoringEnabled,
  computeTechnicalHealth,
  computeAiVisibility,
  bandForTechnicalHealth,
  bandForAiVisibility,
};
