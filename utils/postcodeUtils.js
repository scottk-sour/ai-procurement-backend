// utils/postcodeUtils.js
// UK Postcode lookup using postcodes.io API (free, no auth required)

import axios from 'axios';

const POSTCODES_API = 'https://api.postcodes.io';

/**
 * Lookup a UK postcode and return coordinates and location data
 * Supports both full postcodes (e.g., "SW1A 1AA") and outcodes (e.g., "SW1A", "NP44")
 * @param {string} postcode - UK postcode or outcode
 * @returns {Object} - { valid, latitude, longitude, region, county, country, parliamentary_constituency }
 */
export async function lookupPostcode(postcode) {
  try {
    if (!postcode || typeof postcode !== 'string') {
      return { valid: false, error: 'Invalid postcode provided' };
    }

    // Normalize postcode (remove spaces, uppercase)
    const normalizedPostcode = postcode.replace(/\s+/g, '').toUpperCase();

    // First, try full postcode lookup
    try {
      const response = await axios.get(`${POSTCODES_API}/postcodes/${encodeURIComponent(normalizedPostcode)}`, {
        timeout: 5000
      });

      if (response.data?.status === 200 && response.data?.result) {
        const result = response.data.result;
        return {
          valid: true,
          postcode: result.postcode,
          latitude: result.latitude,
          longitude: result.longitude,
          region: result.region,
          county: result.admin_county || result.admin_district,
          country: result.country,
          constituency: result.parliamentary_constituency,
          outcode: result.outcode,
          incode: result.incode,
          adminDistrict: result.admin_district,
          adminWard: result.admin_ward,
          isOutcode: false
        };
      }
    } catch (postcodeError) {
      // If full postcode lookup fails with 404, try outcode lookup
      if (postcodeError.response?.status === 404) {
        // Continue to outcode lookup below
      } else {
        throw postcodeError;
      }
    }

    // Try outcode lookup (for partial postcodes like "NP44", "SW1A")
    try {
      const outcodeResponse = await axios.get(`${POSTCODES_API}/outcodes/${encodeURIComponent(normalizedPostcode)}`, {
        timeout: 5000
      });

      if (outcodeResponse.data?.status === 200 && outcodeResponse.data?.result) {
        const result = outcodeResponse.data.result;
        return {
          valid: true,
          postcode: result.outcode,
          latitude: result.latitude,
          longitude: result.longitude,
          region: result.admin_district?.[0] || null,
          county: result.admin_county?.[0] || result.admin_district?.[0] || null,
          country: result.country?.[0] || null,
          constituency: result.parliamentary_constituency?.[0] || null,
          outcode: result.outcode,
          incode: null,
          adminDistrict: result.admin_district?.[0] || null,
          adminWard: result.admin_ward?.[0] || null,
          isOutcode: true
        };
      }
    } catch (outcodeError) {
      if (outcodeError.response?.status !== 404) {
        throw outcodeError;
      }
    }

    return { valid: false, error: 'Postcode not found' };

  } catch (error) {
    console.error('Postcode lookup error:', error.message);
    return { valid: false, error: 'Postcode lookup failed' };
  }
}

/**
 * Validate a UK postcode format without making API call
 * @param {string} postcode - UK postcode to validate
 * @returns {boolean}
 */
export function validatePostcodeFormat(postcode) {
  if (!postcode || typeof postcode !== 'string') return false;

  // UK postcode regex (comprehensive)
  const ukPostcodeRegex = /^([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})$/i;
  return ukPostcodeRegex.test(postcode.trim());
}

/**
 * Find nearest postcodes to a given location
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} limit - Max results (default 10)
 * @returns {Array}
 */
export async function findNearestPostcodes(latitude, longitude, limit = 10) {
  try {
    const response = await axios.get(`${POSTCODES_API}/postcodes`, {
      params: {
        lon: longitude,
        lat: latitude,
        limit: Math.min(limit, 100)
      },
      timeout: 5000
    });

    if (response.data?.status === 200 && response.data?.result) {
      return response.data.result.map(item => ({
        postcode: item.postcode,
        latitude: item.latitude,
        longitude: item.longitude,
        distance: item.distance, // Distance in meters
        region: item.region,
        adminDistrict: item.admin_district
      }));
    }

    return [];

  } catch (error) {
    console.error('Nearest postcodes lookup error:', error.message);
    return [];
  }
}

/**
 * Bulk lookup multiple postcodes
 * @param {Array<string>} postcodes - Array of postcodes
 * @returns {Array}
 */
export async function bulkLookupPostcodes(postcodes) {
  try {
    if (!Array.isArray(postcodes) || postcodes.length === 0) {
      return [];
    }

    // API limit is 100 postcodes per request
    const normalizedPostcodes = postcodes
      .slice(0, 100)
      .map(pc => pc.replace(/\s+/g, '').toUpperCase());

    const response = await axios.post(`${POSTCODES_API}/postcodes`, {
      postcodes: normalizedPostcodes
    }, {
      timeout: 10000
    });

    if (response.data?.status === 200 && response.data?.result) {
      return response.data.result.map(item => {
        if (item.result) {
          return {
            query: item.query,
            valid: true,
            postcode: item.result.postcode,
            latitude: item.result.latitude,
            longitude: item.result.longitude,
            region: item.result.region,
            adminDistrict: item.result.admin_district
          };
        }
        return { query: item.query, valid: false };
      });
    }

    return [];

  } catch (error) {
    console.error('Bulk postcode lookup error:', error.message);
    return [];
  }
}

/**
 * Autocomplete partial postcode
 * @param {string} partial - Partial postcode (min 2 chars)
 * @returns {Array}
 */
export async function autocompletePostcode(partial) {
  try {
    if (!partial || partial.length < 2) {
      return [];
    }

    const response = await axios.get(`${POSTCODES_API}/postcodes/${encodeURIComponent(partial)}/autocomplete`, {
      timeout: 5000
    });

    if (response.data?.status === 200 && response.data?.result) {
      return response.data.result;
    }

    return [];

  } catch (error) {
    console.error('Postcode autocomplete error:', error.message);
    return [];
  }
}

export default {
  lookupPostcode,
  validatePostcodeFormat,
  findNearestPostcodes,
  bulkLookupPostcodes,
  autocompletePostcode
};
