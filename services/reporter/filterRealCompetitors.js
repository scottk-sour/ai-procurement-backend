import Vendor from '../../models/Vendor.js';
import { normalizeCompanyName } from '../platformQuery/nameMatch.js';

const categoryCache = new Map();

/**
 * Load normalised firm names for a vendor category.
 * Returns { normSet: Set<string>, normToDisplay: Map<string, string> }.
 * Cached per category for the lifetime of the process.
 */
async function loadCategoryPool(category) {
  if (categoryCache.has(category)) return categoryCache.get(category);

  const filter = category ? { vendorType: category } : {};
  const vendors = await Vendor.find(filter).select('company').lean();

  const normSet = new Set();
  const normToDisplay = new Map();

  for (const v of vendors) {
    if (!v.company) continue;
    const norm = normalizeCompanyName(v.company);
    if (norm) {
      normSet.add(norm);
      if (!normToDisplay.has(norm)) normToDisplay.set(norm, v.company);
    }
  }

  const pool = { normSet, normToDisplay };
  categoryCache.set(category, pool);
  return pool;
}

/**
 * Given an array of raw competitor name strings parsed from AI responses,
 * return only those that correspond to a REAL firm in our directory.
 *
 * Uses normalizeCompanyName + a normalized-name Set lookup against the
 * Vendor collection for the relevant category. Noise (nav labels, advice
 * phrases, AI preamble) matches nothing and is dropped.
 *
 * Includes substring-either-direction matching (same logic as isSameFirm)
 * to handle suffix variations: "Smith & Jones" matches "Smith & Jones LLP".
 *
 * Returns names in the SAME ORDER they were given (preserves AI ranking).
 * Each result: { name: string (display casing from directory), raw: string (original from AI) }.
 */
export async function filterRealCompetitors(rawNames, { category } = {}) {
  if (!rawNames || rawNames.length === 0) return [];

  const { normSet, normToDisplay } = await loadCategoryPool(category || null);

  const results = [];
  const seen = new Set();

  for (const raw of rawNames) {
    const norm = normalizeCompanyName(raw);
    if (!norm) continue;

    let matchedDisplay = null;

    if (normSet.has(norm)) {
      matchedDisplay = normToDisplay.get(norm);
    } else {
      for (const [poolNorm, poolDisplay] of normToDisplay) {
        if (poolNorm.includes(norm) || norm.includes(poolNorm)) {
          matchedDisplay = poolDisplay;
          break;
        }
      }
    }

    if (matchedDisplay && !seen.has(normalizeCompanyName(matchedDisplay))) {
      seen.add(normalizeCompanyName(matchedDisplay));
      results.push({ name: matchedDisplay, raw });
    }
  }

  return results;
}

/**
 * Clear the cached category pools (useful for testing).
 */
export function clearCategoryCache() {
  categoryCache.clear();
}
