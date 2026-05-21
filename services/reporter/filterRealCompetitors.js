import Vendor from '../../models/Vendor.js';
import { normalizeCompanyName } from '../platformQuery/nameMatch.js';

const CATEGORY_TO_VENDOR_TYPE = {
  'solicitor': 'solicitor',
  'solicitors': 'solicitor',
  'commercial law': 'solicitor',
  'commercial property': 'solicitor',
  'consumer law': 'solicitor',
  'conveyancing': 'solicitor',
  'criminal law': 'solicitor',
  'dispute resolution': 'solicitor',
  'employment law': 'solicitor',
  'family law': 'solicitor',
  'housing & landlord': 'solicitor',
  'human rights': 'solicitor',
  'ip & technology': 'solicitor',
  'immigration': 'solicitor',
  'litigation': 'solicitor',
  'mental health': 'solicitor',
  'personal injury': 'solicitor',
  'planning & environment': 'solicitor',
  'residential conveyancing': 'solicitor',
  'social welfare': 'solicitor',
  'wills & probate': 'solicitor',
  'accountants': 'accountant',
  'accountant': 'accountant',
  'estate agents': 'estate-agent',
  'estate-agent': 'estate-agent',
  'mortgage advisors': 'mortgage-advisor',
  'mortgage-advisor': 'mortgage-advisor',
  'financial services': 'financial-advisor',
  'financial-advisor': 'financial-advisor',
  'insurance-broker': 'insurance-broker',
  'it': 'office-equipment',
  'photocopiers': 'office-equipment',
  'telecoms': 'office-equipment',
  'software': 'office-equipment',
  'security': 'office-equipment',
  'office-equipment': 'office-equipment',
};

export function resolveVendorType(category) {
  if (!category) return null;
  const key = category.trim().toLowerCase();
  const resolved = CATEGORY_TO_VENDOR_TYPE[key];
  if (!resolved) {
    console.warn(`[filterRealCompetitors] unmapped category: "${category}" — competitor filter will return empty`);
  }
  return resolved || null;
}

const vendorTypeCache = new Map();

async function loadVendorTypePool(vendorType) {
  if (vendorTypeCache.has(vendorType)) return vendorTypeCache.get(vendorType);

  const filter = vendorType ? { vendorType } : {};
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
  vendorTypeCache.set(vendorType, pool);
  return pool;
}

/**
 * Given an array of raw competitor name strings parsed from AI responses,
 * return only those that correspond to a REAL firm in our directory.
 *
 * The `category` option accepts EITHER a vendorType enum value (e.g.
 * "solicitor") OR a scan-record category (e.g. "Conveyancing", "Accountants").
 * It is resolved to a vendorType via CATEGORY_TO_VENDOR_TYPE before loading
 * the firm pool. All practice-areas within a vertical share one cached pool.
 *
 * Returns names in the SAME ORDER they were given (preserves AI ranking).
 * Each result: { name: string (display casing from directory), raw: string }.
 */
export async function filterRealCompetitors(rawNames, { category } = {}) {
  if (!rawNames || rawNames.length === 0) return [];

  const vendorType = resolveVendorType(category);
  const { normSet, normToDisplay } = await loadVendorTypePool(vendorType);

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

export function clearCategoryCache() {
  vendorTypeCache.clear();
}
