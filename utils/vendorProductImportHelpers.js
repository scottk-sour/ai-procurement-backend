// utils/vendorProductImportHelpers.js - Helper functions for parsing vendor product data

/**
 * Parse lease terms and margins from string format
 * Example: '12:0.7;24:0.65;36:0.6' => [{term:12,margin:0.7},{term:24,margin:0.65},{term:36,margin:0.6}]
 */
export function parseLeaseTermsAndMargins(str) {
  if (!str || typeof str !== 'string') return [];
  
  try {
    return str.split(';').map(pair => {
      const [term, margin] = pair.split(':');
      if (term && margin && !isNaN(term) && !isNaN(margin)) {
        return { 
          term: parseInt(term, 10), 
          margin: parseFloat(margin) 
        };
      }
      return null;
    }).filter(Boolean);
  } catch (error) {
    console.warn('Failed to parse lease terms and margins:', str, error);
    return [];
  }
}

/**
 * Parse auxiliaries from string format
 * Example: 'booklet finisher:250;fax:80' => [{item:"booklet finisher", price:250}, {item:"fax", price:80}]
 */
export function parseAuxiliaries(str) {
  if (!str || typeof str !== 'string') return [];
  
  try {
    return str.split(';').map(pair => {
      const [item, price] = pair.split(':');
      if (item && price && !isNaN(price)) {
        return { 
          item: item.trim(), 
          price: parseFloat(price) 
        };
      }
      return null;
    }).filter(Boolean);
  } catch (error) {
    console.warn('Failed to parse auxiliaries:', str, error);
    return [];
  }
}

/**
 * Parse semicolon-separated list
 * Example: 'feature1;feature2;feature3' => ['feature1', 'feature2', 'feature3']
 */
export function parseSemicolonList(str) {
  if (!str || typeof str !== 'string') return [];
  
  try {
    return str.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  } catch (error) {
    console.warn('Failed to parse semicolon list:', str, error);
    return [];
  }
}

/**
 * Parse comma-separated list
 * Example: 'item1,item2,item3' => ['item1', 'item2', 'item3']
 */
export function parseCommaList(str) {
  if (!str || typeof str !== 'string') return [];
  
  try {
    return str.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  } catch (error) {
    console.warn('Failed to parse comma list:', str, error);
    return [];
  }
}

/**
 * Parse boolean values from various string formats
 */
export function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  
  const str = value.toString().toLowerCase().trim();
  return ['true', 'yes', '1', 'on', 'enabled'].includes(str);
}

/**
 * Parse numeric value with fallback
 */
export function parseNumeric(value, fallback = 0) {
  if (typeof value === 'number') return value;
  if (!value) return fallback;
  
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse integer value with fallback
 */
export function parseInteger(value, fallback = 0) {
  if (typeof value === 'number') return Math.floor(value);
  if (!value) return fallback;
  
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Clean and normalize string values
 */
export function cleanString(value) {
  if (!value) return '';
  return value.toString().trim().replace(/\s+/g, ' ');
}

/**
 * Validate required fields
 */
export function validateRequired(obj, requiredFields) {
  const missing = [];
  
  for (const field of requiredFields) {
    if (!obj[field] || (typeof obj[field] === 'string' && obj[field].trim() === '')) {
      missing.push(field);
    }
  }
  
  return {
    isValid: missing.length === 0,
    missing
  };
}

export default {
  parseLeaseTermsAndMargins,
  parseAuxiliaries,
  parseSemicolonList,
  parseCommaList,
  parseBoolean,
  parseNumeric,
  parseInteger,
  cleanString,
  validateRequired
};
