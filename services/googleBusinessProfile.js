/**
 * Google Business Profile check via Google Places API (Text Search v1).
 *
 * Called as a post-detector step from services/publicAeoReportBuilder.js.
 * Must never throw — the report must still generate if Places is down.
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
  'places.businessStatus',
].join(',');
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const UNAVAILABLE_RESULT = Object.freeze({
  state: 'fail',
  summary: 'GBP check temporarily unavailable',
});
const FAIL_NOT_FOUND_RESULT = Object.freeze({
  state: 'fail',
  summary: 'No Google Business Profile detected',
});
const AMBER_RESULT = Object.freeze({
  state: 'amber',
  summary:
    'Google Business Profile found but incomplete — add opening hours, photos, and description to strengthen AI recommendations',
});
const PASS_RESULT = Object.freeze({
  state: 'pass',
  summary: 'Google Business Profile found and well-populated',
});

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
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, storedAt: Date.now() });
}

function findMatchingPlace(places, city) {
  if (!Array.isArray(places) || places.length === 0) return null;
  const cityToken = String(city).toLowerCase().trim();
  if (!cityToken) return null;
  for (const place of places) {
    const addr = typeof place?.formattedAddress === 'string' ? place.formattedAddress : '';
    if (addr.toLowerCase().includes(cityToken)) return place;
  }
  return null;
}

function classifyPlace(place) {
  const hasHours = !!place?.regularOpeningHours;
  const hasPhotos = Array.isArray(place?.photos) && place.photos.length > 0;
  const hasShortAddress =
    typeof place?.shortFormattedAddress === 'string' && place.shortFormattedAddress.length > 0;
  if (hasHours || hasPhotos || hasShortAddress) return PASS_RESULT;
  return AMBER_RESULT;
}

/**
 * Check whether a Google Business Profile exists for this company + city.
 * Returns a tri-state result — never throws.
 *
 * @param {string} companyName
 * @param {string} city
 * @returns {Promise<{state: 'pass' | 'amber' | 'fail', summary: string}>}
 */
export async function checkGoogleBusinessProfile(companyName, city) {
  if (!companyName || !city) return FAIL_NOT_FOUND_RESULT;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[GBP] GOOGLE_PLACES_API_KEY not set — returning unavailable');
    return UNAVAILABLE_RESULT;
  }

  const key = cacheKey(companyName, city);
  const cached = cacheGet(key);
  if (cached) return cached;

  let response;
  try {
    response = await axios.post(
      ENDPOINT,
      { textQuery: `${companyName} ${city}` },
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
    const result = UNAVAILABLE_RESULT;
    cacheSet(key, result);
    return result;
  }

  if (!response || response.status < 200 || response.status >= 300) {
    console.warn(`[GBP] Places API returned status ${response?.status} for "${companyName}" in "${city}"`);
    const result = UNAVAILABLE_RESULT;
    cacheSet(key, result);
    return result;
  }

  const places = response?.data?.places;
  if (!Array.isArray(places)) {
    console.warn(`[GBP] Places API returned malformed body for "${companyName}" in "${city}"`);
    const result = UNAVAILABLE_RESULT;
    cacheSet(key, result);
    return result;
  }

  const match = findMatchingPlace(places, city);
  const result = match ? classifyPlace(match) : FAIL_NOT_FOUND_RESULT;
  cacheSet(key, result);
  return result;
}

export default checkGoogleBusinessProfile;

// Test-only: reset the in-memory cache. Not part of the public API.
export function __resetGbpCacheForTests() {
  cache.clear();
}
