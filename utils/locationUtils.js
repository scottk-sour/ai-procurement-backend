// utils/locationUtils.js
// Shared location utilities for postcode-area matching and distance filtering

import { lookupPostcode } from './postcodeUtils.js';
import { calculateDistance } from './distanceUtils.js';

/**
 * NEARBY_POSTCODES — maps each UK postcode area to its neighbouring areas.
 * Used for fast postcode-area filtering without API calls.
 * Each key is an outcode prefix (letters only), value is an array of nearby prefixes.
 */
export const NEARBY_POSTCODES = {
  // South Wales
  NP: ['NP', 'CF', 'SA', 'BS', 'BA', 'GL', 'HR', 'LD'],
  CF: ['CF', 'NP', 'SA', 'BS', 'BA', 'LD'],
  SA: ['SA', 'CF', 'NP', 'LD', 'SY'],

  // South West England
  BS: ['BS', 'BA', 'GL', 'NP', 'CF', 'SN', 'TA', 'EX'],
  BA: ['BA', 'BS', 'GL', 'SN', 'TA', 'SP', 'DT', 'NP'],
  GL: ['GL', 'BS', 'BA', 'SN', 'OX', 'WR', 'HR', 'NP'],
  TA: ['TA', 'BA', 'BS', 'EX', 'DT', 'SP'],
  EX: ['EX', 'TA', 'BS', 'DT', 'PL', 'TQ'],
  DT: ['DT', 'BA', 'TA', 'SP', 'BH', 'EX'],
  PL: ['PL', 'EX', 'TQ', 'TR'],
  TQ: ['TQ', 'EX', 'PL'],
  TR: ['TR', 'PL'],
  BH: ['BH', 'DT', 'SP', 'SO', 'PO'],

  // South Central
  SN: ['SN', 'BA', 'GL', 'OX', 'RG', 'SP', 'BS'],
  SP: ['SP', 'BA', 'SN', 'SO', 'BH', 'DT', 'RG'],
  SO: ['SO', 'SP', 'BH', 'PO', 'RG', 'GU', 'BN'],
  PO: ['PO', 'SO', 'BH', 'BN', 'GU', 'RG'],

  // Midlands — Herefordshire / Worcestershire
  HR: ['HR', 'GL', 'WR', 'LD', 'SY', 'NP'],
  WR: ['WR', 'GL', 'HR', 'B', 'CV', 'DY', 'WS'],

  // West Midlands
  B: ['B', 'WS', 'DY', 'WV', 'WR', 'CV', 'NN', 'DE'],
  WS: ['WS', 'B', 'WV', 'DY', 'ST', 'DE'],
  WV: ['WV', 'WS', 'DY', 'B', 'ST', 'TF', 'SY'],
  DY: ['DY', 'B', 'WS', 'WV', 'WR', 'ST'],
  CV: ['CV', 'B', 'NN', 'LE', 'WR', 'OX'],
  TF: ['TF', 'SY', 'WV', 'ST', 'WS'],

  // East Midlands
  DE: ['DE', 'NG', 'LE', 'ST', 'B', 'WS', 'SK'],
  NG: ['NG', 'DE', 'LE', 'LN', 'S', 'DN'],
  LE: ['LE', 'NG', 'DE', 'CV', 'NN', 'PE'],
  NN: ['NN', 'LE', 'CV', 'MK', 'OX', 'PE', 'B'],

  // Staffordshire / Shropshire
  ST: ['ST', 'WS', 'DY', 'DE', 'SK', 'CW', 'TF', 'WV'],
  SY: ['SY', 'TF', 'WV', 'HR', 'LD', 'LL', 'SA', 'CH', 'CW'],

  // North West
  M: ['M', 'SK', 'OL', 'BL', 'WN', 'WA', 'CW', 'ST'],
  SK: ['SK', 'M', 'ST', 'DE', 'S', 'OL', 'CW'],
  OL: ['OL', 'M', 'SK', 'BL', 'HD', 'HX'],
  BL: ['BL', 'M', 'OL', 'WN', 'PR', 'BB'],
  WN: ['WN', 'M', 'BL', 'WA', 'PR', 'L'],
  WA: ['WA', 'M', 'WN', 'CW', 'CH', 'L', 'ST'],
  CW: ['CW', 'WA', 'ST', 'SY', 'CH', 'SK', 'M'],
  CH: ['CH', 'WA', 'CW', 'L', 'LL', 'SY'],
  L: ['L', 'WA', 'WN', 'CH', 'PR'],
  PR: ['PR', 'L', 'WN', 'BL', 'BB', 'FY', 'LA'],
  FY: ['FY', 'PR', 'LA', 'BB'],
  BB: ['BB', 'BL', 'OL', 'PR', 'HX', 'BD'],
  LA: ['LA', 'PR', 'FY', 'CA', 'BD'],

  // Yorkshire
  S: ['S', 'NG', 'DE', 'SK', 'HD', 'DN', 'WF'],
  HD: ['HD', 'S', 'WF', 'OL', 'HX', 'BD'],
  HX: ['HX', 'HD', 'OL', 'BD', 'BB'],
  WF: ['WF', 'HD', 'S', 'LS', 'DN'],
  LS: ['LS', 'WF', 'BD', 'HG', 'YO'],
  BD: ['BD', 'LS', 'HG', 'HX', 'HD', 'BB', 'LA'],
  HG: ['HG', 'LS', 'BD', 'YO', 'DL'],
  YO: ['YO', 'LS', 'HG', 'DL', 'HU', 'DN'],
  DN: ['DN', 'S', 'NG', 'WF', 'HU', 'YO', 'LN'],
  HU: ['HU', 'YO', 'DN', 'LN'],

  // North East
  DL: ['DL', 'YO', 'HG', 'TS', 'DH', 'CA'],
  TS: ['TS', 'DL', 'DH', 'YO'],
  DH: ['DH', 'NE', 'TS', 'DL', 'SR'],
  NE: ['NE', 'DH', 'SR', 'CA', 'TD'],
  SR: ['SR', 'NE', 'DH', 'TS'],
  TD: ['TD', 'NE'],

  // Cumbria
  CA: ['CA', 'LA', 'NE', 'DL', 'TD'],

  // Lincolnshire
  LN: ['LN', 'NG', 'DN', 'HU', 'PE'],
  PE: ['PE', 'LN', 'LE', 'NN', 'CB', 'NR'],

  // East Anglia
  CB: ['CB', 'PE', 'SG', 'IP', 'NR', 'MK'],
  NR: ['NR', 'IP', 'PE', 'CB'],
  IP: ['IP', 'NR', 'CB', 'CO', 'CM'],
  CO: ['CO', 'IP', 'CM', 'CB'],

  // London & Home Counties
  EC: ['EC', 'WC', 'E', 'N', 'SE', 'SW', 'W'],
  WC: ['WC', 'EC', 'N', 'NW', 'W', 'SW', 'SE'],
  E: ['E', 'EC', 'N', 'IG', 'RM', 'SE'],
  N: ['N', 'NW', 'EC', 'WC', 'E', 'EN', 'W'],
  NW: ['NW', 'N', 'WC', 'W', 'HA', 'EN'],
  W: ['W', 'NW', 'WC', 'EC', 'SW', 'UB', 'HA'],
  SW: ['SW', 'W', 'WC', 'EC', 'SE', 'KT', 'TW', 'SM'],
  SE: ['SE', 'SW', 'EC', 'E', 'BR', 'DA', 'CR'],
  EN: ['EN', 'N', 'NW', 'HA', 'AL', 'SG', 'WD'],
  HA: ['HA', 'NW', 'W', 'UB', 'WD', 'EN'],
  UB: ['UB', 'W', 'HA', 'TW', 'SL'],
  TW: ['TW', 'SW', 'W', 'UB', 'KT', 'SL', 'GU'],
  KT: ['KT', 'SW', 'TW', 'SM', 'CR', 'GU', 'RH'],
  SM: ['SM', 'SW', 'KT', 'CR', 'RH'],
  CR: ['CR', 'SE', 'SW', 'SM', 'KT', 'BR', 'RH'],
  BR: ['BR', 'SE', 'CR', 'DA', 'TN'],
  DA: ['DA', 'SE', 'BR', 'RM', 'ME'],
  RM: ['RM', 'E', 'IG', 'DA', 'CM', 'SS'],
  IG: ['IG', 'E', 'RM', 'CM'],
  WD: ['WD', 'HA', 'EN', 'AL', 'HP'],
  AL: ['AL', 'EN', 'WD', 'SG', 'HP', 'LU'],
  SG: ['SG', 'AL', 'EN', 'CB', 'CM', 'LU', 'HP'],
  HP: ['HP', 'WD', 'AL', 'LU', 'SL', 'OX', 'MK'],
  SL: ['SL', 'UB', 'TW', 'HP', 'RG', 'GU'],
  CM: ['CM', 'SG', 'IG', 'RM', 'CO', 'IP', 'CB', 'SS'],
  SS: ['SS', 'RM', 'CM', 'ME'],

  // Thames Valley / Surrey / Sussex
  RG: ['RG', 'SL', 'SN', 'OX', 'GU', 'SO', 'SP', 'HP'],
  OX: ['OX', 'RG', 'SN', 'GL', 'NN', 'MK', 'HP', 'CV'],
  MK: ['MK', 'NN', 'OX', 'HP', 'LU', 'CB', 'SG'],
  LU: ['LU', 'MK', 'AL', 'SG', 'HP'],
  GU: ['GU', 'RG', 'SL', 'TW', 'KT', 'RH', 'SO', 'PO', 'BN'],
  RH: ['RH', 'GU', 'KT', 'CR', 'SM', 'BN', 'TN'],
  BN: ['BN', 'RH', 'GU', 'SO', 'PO', 'TN'],
  TN: ['TN', 'BR', 'RH', 'BN', 'ME', 'CT'],
  ME: ['ME', 'DA', 'TN', 'CT', 'SS'],
  CT: ['CT', 'ME', 'TN'],

  // Wales
  LD: ['LD', 'SY', 'SA', 'HR', 'NP', 'CF'],
  LL: ['LL', 'CH', 'SY', 'SA'],

  // Scotland (selected areas)
  EH: ['EH', 'ML', 'KY', 'FK', 'TD'],
  G: ['G', 'ML', 'FK', 'PA', 'KA'],
  ML: ['ML', 'EH', 'G'],
  FK: ['FK', 'EH', 'G', 'KY', 'PH'],
  KY: ['KY', 'EH', 'FK', 'DD'],
  DD: ['DD', 'KY', 'PH', 'AB'],
  AB: ['AB', 'DD', 'PH', 'IV'],
  PH: ['PH', 'DD', 'FK', 'AB', 'IV', 'PA'],
  PA: ['PA', 'G', 'PH', 'KA'],
  KA: ['KA', 'G', 'PA', 'DG'],
  DG: ['DG', 'KA', 'CA', 'TD'],
  IV: ['IV', 'AB', 'PH'],

  // Northern Ireland
  BT: ['BT'],
};

/**
 * Extract the alphabetic area prefix from a UK postcode.
 * e.g., "NP44 2NZ" → "NP", "BS1 5TH" → "BS", "B1 1AA" → "B", "M1 2AB" → "M"
 * @param {string} postcode
 * @returns {string|null} - The area prefix (uppercase) or null
 */
export function getPostcodeArea(postcode) {
  if (!postcode || typeof postcode !== 'string') return null;
  const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
  const match = cleaned.match(/^([A-Z]{1,2})/);
  return match ? match[1] : null;
}

/**
 * Check if a vendor's postcode areas overlap with a search postcode's nearby areas.
 * @param {string} searchPostcode - The user's search postcode (e.g. "NP44")
 * @param {string[]} vendorPostcodeAreas - The vendor's postcodeAreas array (e.g. ["LL", "CH", "SY"])
 * @returns {boolean}
 */
export function isNearbyPostcodeArea(searchPostcode, vendorPostcodeAreas) {
  const searchArea = getPostcodeArea(searchPostcode);
  if (!searchArea || !Array.isArray(vendorPostcodeAreas) || vendorPostcodeAreas.length === 0) {
    return false;
  }

  const nearbyAreas = NEARBY_POSTCODES[searchArea] || [searchArea];

  return vendorPostcodeAreas.some(vendorArea => {
    const area = getPostcodeArea(vendorArea);
    return area && nearbyAreas.includes(area);
  });
}

/**
 * Check if a vendor is a national/UK-wide supplier (not location-specific).
 * @param {Object} vendor - Vendor object with location field
 * @returns {boolean}
 */
export function isNationalVendor(vendor) {
  const city = (vendor.location?.city || '').toLowerCase().trim();
  const coverage = vendor.location?.coverage || [];

  if (['uk', 'nationwide', 'national', 'uk wide', 'uk-wide'].includes(city)) return true;
  if (!city && (!coverage || coverage.length === 0)) return true;

  const coverageStr = coverage.map(c => c.toLowerCase()).join(' ');
  if (coverageStr.includes('nationwide') || coverageStr.includes('uk wide') || coverageStr.includes('national')) return true;

  return false;
}

/**
 * Filter vendors by postcode proximity using the NEARBY_POSTCODES map.
 * Returns vendors whose postcodeAreas overlap with nearby areas + national vendors.
 * Falls back to distance-based filtering via postcodes.io API if postcode coords available.
 *
 * @param {Array} vendors - Array of vendor objects (lean)
 * @param {string} searchPostcode - User's search postcode (e.g. "NP44", "NP44 2NZ")
 * @param {Object} options - { maxDistanceKm: 80 }
 * @returns {Promise<Array>} - Filtered vendors with _isNational flag
 */
export async function filterVendorsByLocation(vendors, searchPostcode, options = {}) {
  const { maxDistanceKm = 80 } = options;

  if (!searchPostcode || !vendors || vendors.length === 0) {
    return vendors;
  }

  const searchArea = getPostcodeArea(searchPostcode);
  const nearbyAreas = searchArea ? (NEARBY_POSTCODES[searchArea] || [searchArea]) : [];

  // Try to get coordinates for distance-based filtering
  let searchCoords = null;
  try {
    const lookup = await lookupPostcode(searchPostcode);
    if (lookup.valid && lookup.latitude && lookup.longitude) {
      searchCoords = { lat: lookup.latitude, lon: lookup.longitude };
    }
  } catch (err) {
    // Fall back to postcode-area matching only
  }

  const filtered = [];

  for (const vendor of vendors) {
    // Always include national vendors
    if (isNationalVendor(vendor)) {
      filtered.push({ ...vendor, _isNational: true, _distance: null });
      continue;
    }

    // 1. Postcode area match — check vendor's postcodeAreas array
    const vendorAreas = vendor.postcodeAreas || [];
    const vendorPostcode = vendor.location?.postcode || '';
    const vendorArea = getPostcodeArea(vendorPostcode);

    let areaMatch = false;
    if (vendorAreas.length > 0 && nearbyAreas.length > 0) {
      areaMatch = vendorAreas.some(va => {
        const area = getPostcodeArea(va);
        return area && nearbyAreas.includes(area);
      });
    }
    // Also check vendor's own postcode area
    if (!areaMatch && vendorArea && nearbyAreas.includes(vendorArea)) {
      areaMatch = true;
    }

    // 2. Distance-based check (if we have coordinates for both)
    let distanceMatch = false;
    let distance = null;
    const vendorLat = vendor.location?.coordinates?.latitude || vendor.location?.latitude;
    const vendorLon = vendor.location?.coordinates?.longitude || vendor.location?.longitude;
    if (searchCoords && vendorLat && vendorLon) {
      distance = calculateDistance(
        searchCoords.lat, searchCoords.lon,
        vendorLat, vendorLon
      );
      distanceMatch = distance <= maxDistanceKm;
    }

    // 3. Coverage text match — check if vendor's coverage or city mentions a nearby area
    let coverageMatch = false;
    if (!areaMatch && !distanceMatch && nearbyAreas.length > 0) {
      const coverageText = [
        vendor.location?.city || '',
        ...(vendor.location?.coverage || []),
      ].join(' ').toLowerCase();
      // Map postcode areas to city names for text matching
      const areaCities = {
        NP: 'newport', CF: 'cardiff', SA: 'swansea', BS: 'bristol',
        BA: 'bath', GL: 'gloucester', EX: 'exeter', B: 'birmingham',
        M: 'manchester', L: 'liverpool', LS: 'leeds', S: 'sheffield',
      };
      coverageMatch = nearbyAreas.some(area => {
        const city = areaCities[area];
        return city && coverageText.includes(city);
      });
    }

    // Include if area match, distance match, or coverage text match
    if (areaMatch || distanceMatch || coverageMatch) {
      filtered.push({ ...vendor, _isNational: false, _distance: distance });
    }
  }

  // Sort: local vendors by distance (closest first), then national vendors at end
  filtered.sort((a, b) => {
    if (a._isNational && !b._isNational) return 1;
    if (!a._isNational && b._isNational) return -1;
    if (a._distance !== null && b._distance !== null) return a._distance - b._distance;
    return 0;
  });

  return filtered;
}

export default {
  NEARBY_POSTCODES,
  getPostcodeArea,
  isNearbyPostcodeArea,
  isNationalVendor,
  filterVendorsByLocation,
};
