/**
 * FCA Register Scraper for TendorAI
 *
 * Imports FCA-authorised mortgage advisor firms into MongoDB.
 * Searches city-specific + mortgage-related terms, then verifies
 * each firm's postcode area and mortgage permissions.
 *
 * Prerequisites:
 *   - FCA_API_EMAIL and FCA_API_KEY in .env (from FCA Register API)
 *   - MONGODB_URI in .env
 *
 * Usage:
 *   node scripts/scrapeFCA.js --city Cardiff --limit 50
 *   node scripts/scrapeFCA.js --city Cardiff --dry-run
 *   node scripts/scrapeFCA.js --city Newport --limit 20
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from '../models/Vendor.js';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────
const FCA_API_EMAIL = process.env.FCA_API_EMAIL;
const FCA_API_KEY = process.env.FCA_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = 'https://register.fca.org.uk/services/V0.1';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 1100;

// ─── City Config ────────────────────────────────────────────────────
// Postcodes for address verification; search terms combine city name
// with mortgage-related keywords to surface relevant firms.
// Nationwide search terms — we search broadly then filter by postcode area.
// The FCA name-based search only matches firm names, so we need many patterns.
const NATIONWIDE_TERMS = [
  'mortgage broker',
  'mortgage adviser',
  'mortgage advisor',
  'mortgage solutions',
  'independent mortgage',
  'mortgage company',
  'home loans',
  'first mortgage',
  'mortgage network',
  'mortgage centre',
  'mortgage shop',
  'mortgage choice',
  'mortgage point',
  'mortgage direct',
  'mortgage plus',
  'mortgage one',
  'mortgage hub',
  'mortgage link',
];

const CITY_CONFIG = {
  Cardiff: {
    postcodes: range('CF', 10, 24),
    // City-specific terms + nationwide terms (filtered by postcode)
    cityTerms: [
      'mortgage Cardiff',
      'mortgage broker Cardiff',
      'mortgage adviser Cardiff',
      'IFA Cardiff',
      'financial adviser Cardiff',
      'Cardiff',
    ],
  },
  Newport: {
    postcodes: range('NP', 10, 20),
    cityTerms: [
      'mortgage Newport',
      'mortgage broker Newport',
      'IFA Newport',
      'financial adviser Newport',
      'Newport',
    ],
  },
  Bristol: {
    postcodes: range('BS', 1, 16),
    cityTerms: [
      'mortgage Bristol',
      'mortgage broker Bristol',
      'IFA Bristol',
      'financial adviser Bristol',
      'Bristol',
    ],
  },
  Swansea: {
    postcodes: range('SA', 1, 8),
    cityTerms: [
      'mortgage Swansea',
      'mortgage broker Swansea',
      'IFA Swansea',
      'financial adviser Swansea',
      'Swansea',
    ],
  },
};

function range(prefix, start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(`${prefix}${i}`);
  return out;
}

// ─── Parse CLI Args ──────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

const CITY = getArg('city');
const DRY_RUN = args.includes('--dry-run');
const LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : Infinity;

if (!CITY) {
  console.error('ERROR: --city argument is required');
  console.error(`Supported cities: ${Object.keys(CITY_CONFIG).join(', ')}`);
  console.error('Usage: node scripts/scrapeFCA.js --city Cardiff --limit 50');
  process.exit(1);
}

const cityKey = Object.keys(CITY_CONFIG).find(k => k.toLowerCase() === CITY.toLowerCase());
if (!cityKey) {
  console.error(`ERROR: No config for "${CITY}".`);
  console.error(`Supported cities: ${Object.keys(CITY_CONFIG).join(', ')}`);
  process.exit(1);
}

const { postcodes, cityTerms } = CITY_CONFIG[cityKey];
const postcodeSet = new Set(postcodes);
// Combine city-specific terms with nationwide terms
const searchTerms = [...cityTerms, ...NATIONWIDE_TERMS];

// ─── Mortgage Permission Patterns ────────────────────────────────────
// FCA Permissions endpoint returns a nested object:
//   { "Advising on regulated mortgage contracts": [...], "Arranging ...": [...], ... }
// Keys are permission names; we check if any contain "mortgage".
function hasMortgagePermission(permissionsData) {
  if (!permissionsData || typeof permissionsData !== 'object') return false;

  const keys = Array.isArray(permissionsData)
    ? permissionsData.map(p => p.Name || p.name || p.Permission || '')
    : Object.keys(permissionsData);

  return keys.some(k => /mortgage/i.test(k));
}

function extractMortgagePermissions(permissionsData) {
  if (!permissionsData || typeof permissionsData !== 'object') return [];

  const keys = Array.isArray(permissionsData)
    ? permissionsData.map(p => p.Name || p.name || p.Permission || '')
    : Object.keys(permissionsData);

  return keys.filter(k => /mortgage/i.test(k)).map(k => k.trim());
}

function isAppointedRepresentative(status) {
  return /appointed representative/i.test(status || '');
}

// Appointed Representatives include car dealers, shops, etc. that sell
// finance products on behalf of a principal. Only treat an AR as a
// mortgage firm if its name suggests financial/mortgage business.
const MORTGAGE_NAME_PATTERNS = /mortgage|financial|finance broker|IFA|wealth|money|loan|adviser|advisor|independent.*financial|broker.*finance|remortgage|equity release/i;
function looksLikeMortgageFirm(name) {
  return MORTGAGE_NAME_PATTERNS.test(name || '');
}

// ─── Helpers ─────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeCity(city) {
  if (!city) return '';
  return city.trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bUpon\b/g, 'upon')
    .replace(/\bOn\b/g, 'on')
    .replace(/\bIn\b/g, 'in')
    .replace(/\bDe\b/g, 'de')
    .replace(/\bLe\b/g, 'le')
    .replace(/\bLa\b/g, 'la')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bAnd\b/g, 'and')
    .replace(/^./, c => c.toUpperCase());
}

function generateSlug(company, city) {
  const base = `${company} ${city || ''}`.trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

// ─── FCA API Fetch with Retries ──────────────────────────────────────
async function fcaFetch(endpoint) {
  const url = `${BASE_URL}${endpoint}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'X-Auth-Email': FCA_API_EMAIL,
          'X-Auth-Key': FCA_API_KEY,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
      }

      return await response.json();
    } catch (err) {
      console.error(`  ${endpoint} attempt ${attempt}/${MAX_RETRIES}: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
}

// ─── Search ──────────────────────────────────────────────────────────
async function searchPaginated(query, label) {
  const results = [];
  let page = 1;

  while (true) {
    const encoded = encodeURIComponent(query);
    // FCA API uses 'pgnp' for pagination (not 'page')
    const endpoint = `/Search?q=${encoded}&type=firm&pgnp=${page}`;

    let data;
    try {
      data = await fcaFetch(endpoint);
    } catch {
      break;
    }
    await delay(RATE_LIMIT_DELAY_MS);

    if (!data) break;
    if (/no match/i.test(data.Message || '')) break;

    const pageResults = data.Data || [];
    if (pageResults.length === 0) break;

    results.push(...pageResults);

    const totalCount = parseInt(data.ResultInfo?.total_count || '0', 10);
    const perPage = parseInt(data.ResultInfo?.per_page || '20', 10);
    const totalPages = Math.ceil(totalCount / perPage);

    if (page === 1) {
      console.log(`    "${label}": ${totalCount} results, fetching...`);
    }

    if (page >= totalPages) break;
    page++;
  }

  return results;
}

async function searchFirms() {
  const seenFrns = new Set();
  const allResults = [];

  for (const term of searchTerms) {
    const results = await searchPaginated(term, term);

    let added = 0;
    for (const result of results) {
      const frn = result['Reference Number'] || '';
      if (frn && !seenFrns.has(frn)) {
        seenFrns.add(frn);
        allResults.push(result);
        added++;
      }
    }
    if (added > 0) {
      console.log(`    +${added} new unique firms`);
    }
  }

  return allResults;
}

// ─── Build Vendor Doc ────────────────────────────────────────────────
function buildVendorDoc(firmName, frn, details, addr, mortgagePermissions, city) {
  const companiesHouseNumber = details?.Data?.[0]?.['Companies House Number']
    || details?.Data?.[0]?.CompaniesHouseNumber
    || '';

  // Note: FCA API has a typo — "Address LIne 3" (capital I, lowercase n)
  const addressParts = [
    addr['Address Line 1'],
    addr['Address Line 2'],
    addr['Address LIne 3'] || addr['Address Line 3'],
    addr['Address Line 4'],
  ].filter(p => p && p.trim());
  const address = addressParts.join(', ');

  const town = normalizeCity(addr.Town || city);
  const postcode = (addr.Postcode || '').trim();
  const county = (addr.County || '').trim();
  const phone = (addr['Phone Number'] || '').trim();
  const website = (addr['Website Address'] || '').trim();

  // Map FCA permission names to our practice areas
  const practiceAreaSet = new Set(['Residential Mortgages']);
  for (const perm of mortgagePermissions) {
    const p = perm.toLowerCase();
    if (/home reversion|equity release/i.test(p)) practiceAreaSet.add('Equity Release');
    if (/regulated mortgage/i.test(p)) {
      practiceAreaSet.add('Residential Mortgages');
      practiceAreaSet.add('Remortgage');
    }
    if (/buy.?to.?let/i.test(p)) practiceAreaSet.add('Buy-to-Let');
    if (/commercial/i.test(p)) practiceAreaSet.add('Commercial Mortgages');
    if (/protection|insurance/i.test(p)) practiceAreaSet.add('Protection Insurance');
  }
  const practiceAreas = [...practiceAreaSet];
  const slug = generateSlug(firmName, town);

  return {
    name: firmName,
    company: firmName,
    email: `fca-${frn}@placeholder.tendorai.com`,
    vendorType: 'mortgage-advisor',
    fcaNumber: frn,
    regulatoryBody: 'FCA',
    companyNumber: companiesHouseNumber || undefined,
    practiceAreas,
    source: 'fca-register',
    claimed: false,
    services: ['Mortgage Advisors'],
    location: {
      address,
      city: town,
      postcode,
      region: county,
      coverage: [town],
    },
    contactInfo: {
      phone,
      website,
    },
    businessProfile: {
      description: `${firmName} is an FCA-authorised mortgage advisor based in ${town}.`,
      accreditations: ['FCA Authorised'],
    },
    tier: 'free',
    account: {
      status: 'active',
      verificationStatus: 'unverified',
      tier: 'standard',
    },
    listingStatus: 'unclaimed',
    importedAt: new Date(),
    importSource: 'fca-register',
    slug,
    postcodeAreas: postcode ? [postcode.split(' ')[0].toUpperCase()] : [],
  };
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('=== FCA Mortgage Advisor Import ===');
  console.log(`City:      ${cityKey}`);
  console.log(`Postcodes: ${postcodes.join(', ')}`);
  console.log(`Searches:  ${searchTerms.length} terms`);
  console.log(`Mode:      ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit:     ${LIMIT === Infinity ? 'ALL' : LIMIT}`);
  console.log('');

  if (!FCA_API_EMAIL) {
    console.error('ERROR: FCA_API_EMAIL not found in .env');
    process.exit(1);
  }
  if (!FCA_API_KEY) {
    console.error('ERROR: FCA_API_KEY not found in .env');
    process.exit(1);
  }
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not found in .env');
    process.exit(1);
  }

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  // Load existing FCA numbers to skip
  const existingFca = new Set(
    (await Vendor.find({ fcaNumber: { $exists: true, $ne: null } }).select('fcaNumber').lean())
      .map(v => v.fcaNumber)
  );
  console.log(`Found ${existingFca.size} existing FCA records in database.`);

  // Load existing slugs for dedup
  const existingSlugs = new Set(
    (await Vendor.find({ slug: { $exists: true } }).select('slug').lean())
      .map(v => v.slug)
      .filter(Boolean)
  );

  // ── Step 1: Search ──
  console.log(`\nSearching FCA Register for ${cityKey} firms...`);
  const searchResults = await searchFirms();
  console.log(`\nFound ${searchResults.length} unique candidate firms.\n`);

  if (searchResults.length === 0) {
    console.log('No firms found. Exiting.');
    await mongoose.disconnect();
    return;
  }

  // ── Step 2: Process each firm ──
  const stats = {
    searched: searchResults.length,
    processed: 0,
    imported: 0,
    skippedExisting: 0,
    skippedNotAuthorised: 0,
    skippedNoMortgage: 0,
    skippedWrongPostcode: 0,
    skippedError: 0,
    errors: [],
  };

  const slugsSeen = new Set();
  const importedFirms = [];

  for (const result of searchResults) {
    if (importedFirms.length >= LIMIT) {
      console.log(`\nReached import limit of ${LIMIT}. Stopping.`);
      break;
    }

    const frn = result['Reference Number'] || '';
    const searchName = result.Name || '';
    const searchStatus = result.Status || '';

    if (!frn) { stats.skippedError++; continue; }

    // Quick-skip from search status
    if (/no longer/i.test(searchStatus)) {
      stats.skippedNotAuthorised++;
      continue;
    }

    // Skip if already in database
    if (existingFca.has(frn)) {
      stats.skippedExisting++;
      continue;
    }

    // Quick-skip by postcode from search result Name field
    // FCA API embeds postcode in name like "Firm Name (Postcode: AB1 2CD)"
    const pcFromName = searchName.match(/\(Postcode:\s*([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\)/i);
    if (pcFromName) {
      const pcArea = pcFromName[1].toUpperCase().split(' ')[0];
      if (!postcodeSet.has(pcArea)) {
        stats.skippedWrongPostcode++;
        continue;
      }
    }

    stats.processed++;
    console.log(`[${stats.processed}] ${searchName} (FRN: ${frn})...`);

    try {
      // (a) Get firm details
      const details = await fcaFetch(`/Firm/${frn}`);
      await delay(RATE_LIMIT_DELAY_MS);

      const firmData = details?.Data?.[0] || {};
      // Strip postcode from names — FCA API embeds "(Postcode: XX1 2YZ)" in name fields
      const rawName = firmData['Organisation Name'] || firmData.Name || searchName;
      const firmName = rawName.replace(/\s*\(Postcode:.*?\)\s*/g, '').trim();
      const status = firmData.Status || searchStatus || '';

      // (b) Skip if clearly not authorised
      if (/revoked|cancelled|no longer/i.test(status)) {
        console.log(`  Skip: status "${status}"`);
        stats.skippedNotAuthorised++;
        continue;
      }

      // (c) Check mortgage permissions
      // Appointed Representatives operate under their principal firm's FCA
      // authorisation, so the Permissions endpoint returns null for them.
      // Only accept ARs whose name suggests mortgage/financial business
      // (filters out car dealers, shops, etc. that are ARs for credit).
      const isAR = isAppointedRepresentative(status);
      let mortgagePermissions = [];

      if (isAR) {
        if (!looksLikeMortgageFirm(firmName)) {
          console.log(`  Skip: AR not mortgage-related ("${firmName}")`);
          stats.skippedNoMortgage++;
          continue;
        }
        console.log(`  Appointed Representative (mortgage-related) — skipping permissions check`);
        mortgagePermissions = ['Mortgage Advice'];
      } else {
        const permissions = await fcaFetch(`/Firm/${frn}/Permissions`);
        await delay(RATE_LIMIT_DELAY_MS);

        const permData = permissions?.Data || {};
        if (!hasMortgagePermission(permData)) {
          console.log(`  Skip: no mortgage permissions`);
          stats.skippedNoMortgage++;
          continue;
        }

        mortgagePermissions = extractMortgagePermissions(permData);
      }

      // (d) Get address — prefer principal place of business
      const addressData = await fcaFetch(`/Firm/${frn}/Address`);
      await delay(RATE_LIMIT_DELAY_MS);

      const addresses = addressData?.Data || [];
      const ppob = addresses.find(a => /principal/i.test(a['Address Type'] || ''));
      const addr = ppob || addresses[0] || {};

      // (e) Verify postcode is in target area
      const firmPostcode = (addr.Postcode || '').trim().toUpperCase();
      const firmPcArea = firmPostcode.split(' ')[0];
      if (firmPostcode && !postcodeSet.has(firmPcArea)) {
        console.log(`  Skip: postcode ${firmPostcode} outside ${cityKey}`);
        stats.skippedWrongPostcode++;
        continue;
      }

      // Build vendor doc
      const doc = buildVendorDoc(firmName, frn, details, addr, mortgagePermissions, cityKey);

      // Ensure slug uniqueness
      let slug = doc.slug;
      let slugSuffix = 1;
      while (existingSlugs.has(slug) || slugsSeen.has(slug)) {
        slug = `${doc.slug}-${slugSuffix}`;
        slugSuffix++;
      }
      doc.slug = slug;
      slugsSeen.add(slug);

      if (DRY_RUN) {
        console.log(`  -> Would import: ${firmName} (${firmPostcode})`);
        importedFirms.push(doc);
      } else {
        await Vendor.updateOne(
          { fcaNumber: frn },
          { $set: doc },
          { upsert: true }
        );
        console.log(`  -> Imported: ${firmName} (${firmPostcode})`);
        stats.imported++;
        importedFirms.push(doc);
        existingFca.add(frn);
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      stats.skippedError++;
      stats.errors.push(`${searchName} (${frn}): ${err.message}`);
    }
  }

  // ── Summary ──
  console.log('\n====================================');
  console.log('       FCA IMPORT RESULTS');
  console.log('====================================');
  console.log(`City:                       ${cityKey}`);
  console.log(`Postcode areas:             ${postcodes.join(', ')}`);
  console.log(`Candidate firms:            ${stats.searched}`);
  console.log(`Processed (API calls):      ${stats.processed}`);
  console.log(`Imported:                   ${DRY_RUN ? `${importedFirms.length} (dry run)` : stats.imported}`);
  console.log(`Skipped - existing FCA:     ${stats.skippedExisting}`);
  console.log(`Skipped - not authorised:   ${stats.skippedNotAuthorised}`);
  console.log(`Skipped - no mortgage:      ${stats.skippedNoMortgage}`);
  console.log(`Skipped - wrong postcode:   ${stats.skippedWrongPostcode}`);
  console.log(`Skipped - errors:           ${stats.skippedError}`);

  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    stats.errors.slice(0, 20).forEach(e => console.log(`  - ${e}`));
  }

  if (DRY_RUN && importedFirms.length > 0) {
    console.log('\n--- Sample Record ---');
    console.log(JSON.stringify(importedFirms[0], null, 2));
  }

  if (!DRY_RUN) {
    const totalMortgage = await Vendor.countDocuments({ vendorType: 'mortgage-advisor' });
    console.log(`\nTotal mortgage advisors in database: ${totalMortgage}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  mongoose.disconnect();
  process.exit(1);
});
