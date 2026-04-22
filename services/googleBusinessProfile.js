/**
 * Google Business Profile + Google Reviews checks via Google Places API
 * (Text Search v1).
 *
 * Both checks share a single Places lookup + 24h cache, so adding the reviews
 * check costs zero extra API calls. Called as post-detector steps from
 * services/publicAeoReportBuilder.js and services/aeoReportGenerator.js.
 * Neither check throws — reports must still generate if Places is down.
 */

import axios from 'axios';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.regularOpeningHours',
  'places.photos',
  'places.shortFormattedAddress',
  'places.primaryType',
  'places.types',
  'places.businessStatus',
  'places.rating',
  'places.userRatingCount',
].join(',');
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// At least 3 reviews before we mark the check as passing. 1-2 is barely a
// signal; 3+ shows a pattern. Adjust once we see real-world data.
const REVIEWS_MIN_COUNT = 3;

const GBP_UNAVAILABLE_RESULT = Object.freeze({
  state: 'fail',
  summary: 'GBP check temporarily unavailable',
});
const GBP_FAIL_NOT_FOUND_RESULT = Object.freeze({
  state: 'fail',
  summary: 'No Google Business Profile detected',
});
const GBP_AMBER_RESULT = Object.freeze({
  state: 'amber',
  summary:
    'Google Business Profile found but incomplete — add opening hours, photos, and description to strengthen AI recommendations',
});
const GBP_PASS_RESULT = Object.freeze({
  state: 'pass',
  summary: 'Google Business Profile found and well-populated',
});

const REVIEWS_UNAVAILABLE_RESULT = Object.freeze({
  state: 'fail',
  summary: 'Google reviews check temporarily unavailable',
});
const REVIEWS_NO_GBP_RESULT = Object.freeze({
  state: 'fail',
  summary: 'No Google Business Profile found (reviews are tied to a GBP)',
});

// cache key -> { storedAt, lookup: { status, place? } }
// status is 'ok' (place is the matched place object or null when no match) or
// 'unavailable' (upstream API failure — do not retry for the TTL).
const cache = new Map();

function cacheKey(companyName, city) {
  return `gbp:${String(companyName).toLowerCase().trim()}|${String(city).toLowerCase().trim()}`;
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.lookup;
}

function cacheSet(key, lookup) {
  cache.set(key, { lookup, storedAt: Date.now() });
}

// Lowercase + strip diacritics so "Cwmbrân" matches "Cwmbran" and similar.
function normalizeForMatch(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function findMatchingPlace(places, city) {
  if (!Array.isArray(places) || places.length === 0) return null;
  const cityToken = normalizeForMatch(city);
  if (!cityToken) return null;
  for (const place of places) {
    const haystack = [
      typeof place?.formattedAddress === 'string' ? place.formattedAddress : '',
      typeof place?.shortFormattedAddress === 'string' ? place.shortFormattedAddress : '',
      typeof place?.displayName?.text === 'string' ? place.displayName.text : '',
    ].map(normalizeForMatch).join(' | ');
    if (haystack.includes(cityToken)) return place;
  }
  return null;
}

// Strip trailing UK company-form suffixes so the Places textQuery matches the
// way a GBP is actually registered. A listing like "TendorAI" won't rank
// against "TendorAI LTD Cwmbran" on a fresh GBP with no other signals. We only
// strip suffixes at the end of the name — "Sons of Anarchy" stays intact, but
// "Smith & Sons Ltd" becomes "Smith".
const COMPANY_SUFFIX_RE = /[\s,]+(?:ltd|limited|llp|plc|co|company|uk|(?:&\s*|and\s+)sons|inc|incorporated)\.?$/i;

function stripCompanySuffix(name) {
  let s = String(name || '').replace(/\s+/g, ' ').trim();
  let prev;
  do {
    prev = s;
    s = s.replace(COMPANY_SUFFIX_RE, '').trim();
  } while (s !== prev && s.length > 0);
  return s || String(name || '').trim();
}

/**
 * Shared Places lookup. Returns a tri-state:
 *   { status: 'ok', place: <place>|null }  — API succeeded; place may be null for no match
 *   { status: 'unavailable' }              — API failed (missing key, timeout, non-2xx, malformed)
 *
 * Result is cached under the company+city key so both GBP and Reviews checks
 * on the same report share one Places call.
 */
async function lookupPlace(companyName, city) {
  if (!companyName || !city) return { status: 'ok', place: null };

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[GBP] GOOGLE_PLACES_API_KEY not set — returning unavailable');
    return { status: 'unavailable' };
  }

  const key = cacheKey(companyName, city);
  const cached = cacheGet(key);
  if (cached) return cached;

  const queryName = stripCompanySuffix(companyName);

  let response;
  try {
    response = await axios.post(
      ENDPOINT,
      { textQuery: `${queryName} ${city}` },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        timeout: TIMEOUT_MS,
        validateStatus: () => true,
      },
    );
  } catch (err) {
    console.warn(`[GBP] Places API request failed for "${companyName}" in "${city}": ${err.code || err.message}`);
    const lookup = { status: 'unavailable' };
    cacheSet(key, lookup);
    return lookup;
  }

  if (!response || response.status < 200 || response.status >= 300) {
    console.warn(`[GBP] Places API returned status ${response?.status} for "${companyName}" in "${city}"`);
    const lookup = { status: 'unavailable' };
    cacheSet(key, lookup);
    return lookup;
  }

  const places = response?.data?.places;
  if (!Array.isArray(places)) {
    console.warn(`[GBP] Places API returned malformed body for "${companyName}" in "${city}"`);
    const lookup = { status: 'unavailable' };
    cacheSet(key, lookup);
    return lookup;
  }

  const match = findMatchingPlace(places, city);
  const lookup = { status: 'ok', place: match || null };
  cacheSet(key, lookup);
  return lookup;
}

function classifyPlaceForGbp(place) {
  const hasHours = !!place?.regularOpeningHours;
  const hasPhotos = Array.isArray(place?.photos) && place.photos.length > 0;
  const hasShortAddress =
    typeof place?.shortFormattedAddress === 'string' && place.shortFormattedAddress.length > 0;
  if (hasHours || hasPhotos || hasShortAddress) return GBP_PASS_RESULT;
  return GBP_AMBER_RESULT;
}

function formatRating(rating) {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
  return Number.isInteger(rating) ? `${rating}.0` : rating.toFixed(1);
}

/**
 * Check whether a Google Business Profile exists for this company + city.
 * Tri-state ('pass' | 'amber' | 'fail') — never throws.
 *
 * @param {string} companyName
 * @param {string} city
 * @returns {Promise<{state: 'pass' | 'amber' | 'fail', summary: string}>}
 */
export async function checkGoogleBusinessProfile(companyName, city) {
  if (!companyName || !city) return GBP_FAIL_NOT_FOUND_RESULT;

  const lookup = await lookupPlace(companyName, city);
  if (lookup.status === 'unavailable') return GBP_UNAVAILABLE_RESULT;
  if (!lookup.place) return GBP_FAIL_NOT_FOUND_RESULT;
  return classifyPlaceForGbp(lookup.place);
}

/**
 * Check whether this company's Google Business Profile carries at least
 * REVIEWS_MIN_COUNT reviews. Reuses the GBP Places lookup cache — no extra
 * API call. Never throws.
 *
 * @param {string} companyName
 * @param {string} city
 * @returns {Promise<{state: 'pass' | 'fail', summary: string, rating?: number, count?: number}>}
 */
export async function checkGoogleReviews(companyName, city) {
  if (!companyName || !city) return REVIEWS_NO_GBP_RESULT;

  const lookup = await lookupPlace(companyName, city);
  if (lookup.status === 'unavailable') return REVIEWS_UNAVAILABLE_RESULT;
  if (!lookup.place) return REVIEWS_NO_GBP_RESULT;

  const place = lookup.place;
  const rating = typeof place.rating === 'number' ? place.rating : null;
  const count = typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;

  if (count >= REVIEWS_MIN_COUNT) {
    const ratingStr = formatRating(rating);
    const summary = ratingStr
      ? `${count} Google reviews (${ratingStr}★ average)`
      : `${count} Google reviews`;
    return { state: 'pass', summary, rating: rating ?? undefined, count };
  }

  return {
    state: 'fail',
    summary: 'Fewer than 3 Google reviews — ask customers to leave a review',
    rating: rating ?? undefined,
    count,
  };
}

// Vendor-type → Google Places type values we consider a category match.
// Kept in this module so Places-specific strings don't leak into scoring logic.
// Any vendor type not in this table resolves to 'skipped' — callers redistribute
// those points across other AI Visibility signals.
const VENDOR_TYPE_TO_PLACES_TYPES = Object.freeze({
  solicitor: ['lawyer', 'legal_services'],
  accountant: ['accounting'],
  'mortgage-advisor': ['finance', 'insurance_agency'],
  'estate-agent': ['real_estate_agency'],
});

const LISTING_SKIPPED_RESULT = Object.freeze({
  state: 'skipped',
  summary: 'Places category check not applicable for this vendor type',
});
const LISTING_UNAVAILABLE_RESULT = Object.freeze({
  state: 'fail',
  summary: 'Places listing check temporarily unavailable',
});
const LISTING_NO_MATCH_RESULT = Object.freeze({
  state: 'fail',
  summary: 'No matching Google Places listing found',
});

/**
 * Grade the Google Places listing for category alignment. Reuses the shared
 * lookupPlace cache — costs zero extra Places API calls when GBP/Reviews
 * already ran for this company+city.
 *
 * @param {string} companyName
 * @param {string} city
 * @param {string} expectedVendorType - 'solicitor' | 'accountant' |
 *   'mortgage-advisor' | 'estate-agent'. Any other value resolves to 'skipped'.
 * @returns {Promise<{state: 'pass' | 'amber' | 'fail' | 'skipped', summary: string, primaryType?: string, types?: string[]}>}
 */
export async function checkPlacesListingQuality(companyName, city, expectedVendorType) {
  const expectedTypes = VENDOR_TYPE_TO_PLACES_TYPES[expectedVendorType];
  if (!Array.isArray(expectedTypes) || expectedTypes.length === 0) {
    return LISTING_SKIPPED_RESULT;
  }
  if (!companyName || !city) return LISTING_NO_MATCH_RESULT;

  const lookup = await lookupPlace(companyName, city);
  if (lookup.status === 'unavailable') return LISTING_UNAVAILABLE_RESULT;
  if (!lookup.place) return LISTING_NO_MATCH_RESULT;

  const place = lookup.place;
  const primaryType = typeof place.primaryType === 'string' ? place.primaryType : null;
  const types = Array.isArray(place.types)
    ? place.types.filter((t) => typeof t === 'string')
    : [];

  if (primaryType && expectedTypes.includes(primaryType)) {
    return {
      state: 'pass',
      summary: `Listing primary category is "${primaryType}"`,
      primaryType,
      types,
    };
  }

  const typeHit = types.find((t) => expectedTypes.includes(t));
  if (typeHit) {
    return {
      state: 'amber',
      summary: `Listing carries "${typeHit}" but primary category is ${primaryType ? `"${primaryType}"` : 'generic'}`,
      primaryType,
      types,
    };
  }

  return {
    state: 'fail',
    summary: primaryType
      ? `Listing is categorised "${primaryType}" — does not match expected vendor type`
      : 'Listing has no category that matches expected vendor type',
    primaryType,
    types,
  };
}

export default checkGoogleBusinessProfile;

// Test-only: reset the in-memory cache. Not part of the public API.
export function __resetGbpCacheForTests() {
  cache.clear();
}
