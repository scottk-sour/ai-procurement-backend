// utils/distanceUtils.js
// Distance calculation utilities using Haversine formula

/**
 * Calculate the distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @param {string} unit - 'km' (default), 'miles', or 'meters'
 * @returns {number} - Distance in specified unit
 */
export function calculateDistance(lat1, lon1, lat2, lon2, unit = 'km') {
  // Earth's radius
  const R = {
    km: 6371,
    miles: 3959,
    meters: 6371000
  };

  const radius = R[unit] || R.km;

  // Convert degrees to radians
  const toRad = (deg) => deg * (Math.PI / 180);

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radius * c;
}

/**
 * Filter items by distance from a point
 * @param {Array} items - Array of items with lat/lon properties
 * @param {number} centerLat - Center latitude
 * @param {number} centerLon - Center longitude
 * @param {number} maxDistance - Maximum distance in km
 * @param {string} latField - Field name for latitude (default 'latitude')
 * @param {string} lonField - Field name for longitude (default 'longitude')
 * @returns {Array} - Items within distance, with distance property added
 */
export function filterByDistance(items, centerLat, centerLon, maxDistance, latField = 'latitude', lonField = 'longitude') {
  if (!Array.isArray(items) || !centerLat || !centerLon || !maxDistance) {
    return items;
  }

  return items
    .map(item => {
      const itemLat = getNestedValue(item, latField);
      const itemLon = getNestedValue(item, lonField);

      if (itemLat && itemLon) {
        const distance = calculateDistance(centerLat, centerLon, itemLat, itemLon);
        return { ...item, _distance: distance };
      }
      return { ...item, _distance: Infinity };
    })
    .filter(item => item._distance <= maxDistance)
    .sort((a, b) => a._distance - b._distance);
}

/**
 * Sort items by distance from a point
 * @param {Array} items - Array of items with lat/lon properties
 * @param {number} centerLat - Center latitude
 * @param {number} centerLon - Center longitude
 * @param {string} latField - Field name for latitude
 * @param {string} lonField - Field name for longitude
 * @returns {Array} - Items sorted by distance (closest first)
 */
export function sortByDistance(items, centerLat, centerLon, latField = 'latitude', lonField = 'longitude') {
  if (!Array.isArray(items) || !centerLat || !centerLon) {
    return items;
  }

  return items
    .map(item => {
      const itemLat = getNestedValue(item, latField);
      const itemLon = getNestedValue(item, lonField);

      if (itemLat && itemLon) {
        const distance = calculateDistance(centerLat, centerLon, itemLat, itemLon);
        return { ...item, _distance: Math.round(distance * 10) / 10 }; // Round to 1 decimal
      }
      return { ...item, _distance: null };
    })
    .sort((a, b) => {
      if (a._distance === null) return 1;
      if (b._distance === null) return -1;
      return a._distance - b._distance;
    });
}

/**
 * Get bounding box for a center point and radius
 * Useful for efficient database queries before precise distance calculation
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Object} - { minLat, maxLat, minLon, maxLon }
 */
export function getBoundingBox(lat, lon, radiusKm) {
  // Earth's radius in km
  const R = 6371;

  // Angular radius
  const radDist = radiusKm / R;

  // Convert to radians
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);

  const minLat = latRad - radDist;
  const maxLat = latRad + radDist;

  const deltaLon = Math.asin(Math.sin(radDist) / Math.cos(latRad));
  const minLon = lonRad - deltaLon;
  const maxLon = lonRad + deltaLon;

  // Convert back to degrees
  return {
    minLat: minLat * (180 / Math.PI),
    maxLat: maxLat * (180 / Math.PI),
    minLon: minLon * (180 / Math.PI),
    maxLon: maxLon * (180 / Math.PI)
  };
}

/**
 * Format distance for display
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} - Formatted distance string
 */
export function formatDistance(distanceKm) {
  if (distanceKm === null || distanceKm === undefined) {
    return 'Unknown distance';
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }

  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km`;
  }

  return `${Math.round(distanceKm)} km`;
}

/**
 * Convert miles to kilometers
 * @param {number} miles
 * @returns {number}
 */
export function milesToKm(miles) {
  return miles * 1.60934;
}

/**
 * Convert kilometers to miles
 * @param {number} km
 * @returns {number}
 */
export function kmToMiles(km) {
  return km / 1.60934;
}

/**
 * Helper to get nested object value
 * @param {Object} obj
 * @param {string} path - Dot-notation path (e.g., 'location.latitude')
 * @returns {*}
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * UK-specific distance helpers
 */
export const UK_DISTANCES = {
  LOCAL: 10,      // 10 km - Local area
  REGIONAL: 50,   // 50 km - Regional
  NATIONAL: 500   // 500 km - National (covers most of UK)
};

export default {
  calculateDistance,
  filterByDistance,
  sortByDistance,
  getBoundingBox,
  formatDistance,
  milesToKm,
  kmToMiles,
  UK_DISTANCES
};
