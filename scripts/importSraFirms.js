/**
 * SRA Solicitor Import Script for TendorAI
 *
 * Imports all authorised solicitor firms from the SRA public API into MongoDB.
 *
 * Prerequisites:
 *   - SRA_API_KEY in .env (free from https://sra-prod-apim.developer.azure-api.net/signup)
 *   - MONGODB_URI in .env
 *
 * Usage:
 *   node scripts/importSraFirms.js
 *   node scripts/importSraFirms.js --dry-run
 *   node scripts/importSraFirms.js --limit=100
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from '../models/Vendor.js';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────
const SRA_API_KEY = process.env.SRA_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = 'https://sra-prod-apim.azure-api.net/datashare/api/V1/organisation/GetAll';
const PAGE_SIZE = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const IMPORT_LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// ─── Practice Area Mapping ────────────────────────────────────────────
// Mapping based on actual SRA API WorkArea values
const PRACTICE_AREA_RULES = [
  { pattern: /property\s*-\s*residential|residential conveyancing/i, mapped: 'Conveyancing' },
  { pattern: /property\s*-\s*commercial|commercial conveyancing|commercial property/i, mapped: 'Commercial Property' },
  { pattern: /family\s*\/?\s*matrimonial|family and matrimonial/i, mapped: 'Family Law' },
  { pattern: /^children$/i, mapped: 'Family Law' },
  { pattern: /^criminal$/i, mapped: 'Criminal Law' },
  { pattern: /criminal litigation|crime/i, mapped: 'Criminal Law' },
  { pattern: /commercial\s*\/?\s*corporate|company and commercial|mergers/i, mapped: 'Commercial Law' },
  { pattern: /^employment$/i, mapped: 'Employment Law' },
  { pattern: /wills|probate|trusts|elderly client|tax planning/i, mapped: 'Wills & Probate' },
  { pattern: /^immigration$|asylum/i, mapped: 'Immigration' },
  { pattern: /personal injury|clinical negligence|medical negligence/i, mapped: 'Personal Injury' },
  { pattern: /debt|insolvency|bankruptcy/i, mapped: 'Debt & Insolvency' },
  { pattern: /intellectual property/i, mapped: 'IP & Technology' },
  { pattern: /^planning$/i, mapped: 'Planning & Environment' },
  { pattern: /landlord and tenant/i, mapped: 'Housing & Landlord' },
  { pattern: /social welfare|welfare benefits/i, mapped: 'Social Welfare' },
  { pattern: /discrimination|civil liberties|human rights/i, mapped: 'Human Rights' },
  { pattern: /mental health/i, mapped: 'Mental Health' },
  { pattern: /^consumer$/i, mapped: 'Consumer Law' },
  { pattern: /arbitration|alternative dispute/i, mapped: 'Dispute Resolution' },
  { pattern: /financial advice/i, mapped: 'Financial Services' },
  { pattern: /litigation\s*-\s*other/i, mapped: 'Litigation' },
  { pattern: /non-litigation\s*-\s*other/i, mapped: 'Non-Litigation' },
];

function mapPracticeAreas(workAreas) {
  if (!Array.isArray(workAreas) || workAreas.length === 0) return [];

  const mapped = new Set();
  for (const area of workAreas) {
    if (!area || typeof area !== 'string') continue;
    let matched = false;
    for (const rule of PRACTICE_AREA_RULES) {
      if (rule.pattern.test(area)) {
        mapped.add(rule.mapped);
        matched = true;
        break;
      }
    }
    if (!matched) {
      mapped.add(area.trim());
    }
  }
  return [...mapped];
}

// ─── City Name Normalization ──────────────────────────────────────────
function normalizeCity(city) {
  if (!city) return '';
  // Title case, but handle hyphenated names and "upon" etc.
  return city.trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    // Fix common prepositions that shouldn't be capitalized
    .replace(/\bUpon\b/g, 'upon')
    .replace(/\bOn\b/g, 'on')
    .replace(/\bIn\b/g, 'in')
    .replace(/\bDe\b/g, 'de')
    .replace(/\bLe\b/g, 'le')
    .replace(/\bLa\b/g, 'la')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bAnd\b/g, 'and')
    // But capitalize first letter always
    .replace(/^./, c => c.toUpperCase());
}

// ─── Slug Generation ──────────────────────────────────────────────────
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

// ─── API Fetch with Retries ──────────────────────────────────────────
async function fetchPage(page) {
  const url = `${BASE_URL}?page=${page}&pageSize=${PAGE_SIZE}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Ocp-Apim-Subscription-Key': SRA_API_KEY,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
      }

      return await response.json();
    } catch (err) {
      console.error(`  Page ${page} attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      } else {
        throw err;
      }
    }
  }
}

// ─── Pick Best Office ─────────────────────────────────────────────────
function pickOffice(offices) {
  if (!offices || offices.length === 0) return null;
  // Prefer head office (API uses "HO" or "Head office")
  const head = offices.find(o =>
    o.OfficeType && (o.OfficeType === 'HO' || o.OfficeType.toLowerCase().includes('head'))
  );
  return head || offices[0];
}

// ─── Build Vendor Doc from SRA Org ────────────────────────────────────
function buildVendorDoc(org) {
  const office = pickOffice(org.Offices);
  if (!office) return null;

  const rawTown = (office.Town || '').trim();
  const country = (office.Country || '').trim();

  // Skip if no town
  if (!rawTown) return null;

  const town = normalizeCity(rawTown);

  // Skip if not England or Wales
  if (country && !['England', 'Wales'].includes(country)) return null;

  // Build address from non-empty parts
  const addressParts = [
    office.Address1, office.Address2, office.Address3, office.Address4
  ].filter(p => p && p.trim());
  const address = addressParts.join(', ');

  const postcode = (office.Postcode || '').trim();
  const county = (office.County || '').trim();

  // Website: prefer office, fallback to org Websites array
  let website = (office.Website || '').trim();
  if (!website && Array.isArray(org.Websites) && org.Websites.length > 0) {
    website = (org.Websites[0] || '').trim();
  }

  // Email: use office email
  const email = (office.Email || '').trim();

  // Phone
  const phone = (office.PhoneNumber || '').trim();

  // Practice areas
  const practiceAreas = mapPracticeAreas(org.WorkArea);

  // Company name
  const company = (org.PracticeName || '').trim();
  if (!company) return null;

  // SRA number as string
  const sraNumber = String(org.SraNumber || org.Id || '').trim();
  if (!sraNumber) return null;

  // Generate a unique placeholder email (SRA firms often don't have unique emails)
  const vendorEmail = email || `sra-${sraNumber}@placeholder.tendorai.com`;

  const slug = generateSlug(company, town);

  return {
    name: company,
    company,
    email: vendorEmail.toLowerCase(),
    vendorType: 'solicitor',
    sraNumber,
    regulatoryBody: 'SRA',
    practiceAreas,
    organisationType: (org.OrganisationType || '').trim(),
    companyNumber: (org.CompanyRegNo || '').trim() || undefined,
    officeCount: org.NoOfOffices || 1,
    source: 'sra-api',
    claimed: false,
    services: ['Solicitors'],
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
      description: `${company} is an SRA-authorised solicitor firm based in ${town}.${practiceAreas.length > 0 ? ` Practice areas include ${practiceAreas.join(', ')}.` : ''}`,
      accreditations: ['SRA Authorised'],
    },
    tier: 'free',
    account: {
      status: 'active',
      verificationStatus: 'unverified',
      tier: 'standard',
    },
    listingStatus: 'unclaimed',
    importedAt: new Date(),
    importSource: 'sra-api',
    slug,
    postcodeAreas: postcode ? [postcode.split(' ')[0].toUpperCase()] : [],
  };
}

// ─── Main Import ──────────────────────────────────────────────────────
async function main() {
  console.log('=== SRA Solicitor Import ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${IMPORT_LIMIT === Infinity ? 'ALL' : IMPORT_LIMIT}`);
  console.log('');

  if (!SRA_API_KEY) {
    console.error('ERROR: SRA_API_KEY not found in .env');
    console.error('Get a free key at: https://sra-prod-apim.developer.azure-api.net/signup');
    process.exit(1);
  }

  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not found in .env');
    process.exit(1);
  }

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  // First, set vendorType for existing vendors that don't have it
  const updateResult = await Vendor.updateMany(
    { vendorType: { $exists: false } },
    { $set: { vendorType: 'office-equipment' } }
  );
  if (updateResult.modifiedCount > 0) {
    console.log(`Set vendorType="office-equipment" for ${updateResult.modifiedCount} existing vendors.`);
  }

  // Get existing SRA numbers to skip duplicates
  const existingSra = new Set(
    (await Vendor.find({ sraNumber: { $exists: true, $ne: null } }).select('sraNumber').lean())
      .map(v => v.sraNumber)
  );
  console.log(`Found ${existingSra.size} existing SRA records in database.`);

  // Also collect existing emails to handle uniqueness
  const existingEmails = new Set(
    (await Vendor.find().select('email').lean()).map(v => v.email)
  );
  console.log(`Found ${existingEmails.size} existing email addresses.`);

  // ── Step 1: Test request to understand API shape ──
  console.log('\nTesting SRA API with pageSize=2...');
  let testData;
  try {
    testData = await fetchPage(1);
    // Log structure to understand the response
    const keys = Object.keys(testData || {});
    console.log(`Response keys: ${keys.join(', ')}`);

    // Detect the array field name
    let orgArrayKey = null;
    let totalCountKey = null;
    for (const key of keys) {
      if (Array.isArray(testData[key])) {
        orgArrayKey = key;
        console.log(`  Array field: "${key}" (${testData[key].length} items)`);
      } else if (typeof testData[key] === 'number') {
        totalCountKey = key;
        console.log(`  Count field: "${key}" = ${testData[key]}`);
      }
    }

    if (!orgArrayKey) {
      // Maybe the response IS the array
      if (Array.isArray(testData)) {
        console.log(`  Response is a direct array with ${testData.length} items`);
      } else {
        console.log('  Full response shape:', JSON.stringify(testData, null, 2).substring(0, 2000));
      }
    } else if (testData[orgArrayKey].length > 0) {
      const sample = testData[orgArrayKey][0];
      console.log(`  Sample org keys: ${Object.keys(sample).join(', ')}`);
      console.log(`  Sample org name: ${sample.PracticeName || sample.Name || sample.name || 'unknown'}`);
      console.log(`  Sample SRA number: ${sample.SraNumber || sample.sraNumber || sample.Id || 'unknown'}`);
      if (sample.Offices && sample.Offices.length > 0) {
        console.log(`  Sample office keys: ${Object.keys(sample.Offices[0]).join(', ')}`);
      }
      if (sample.AuthorisationStatus) {
        console.log(`  Sample auth status: "${sample.AuthorisationStatus}"`);
      }
    }
  } catch (err) {
    console.error(`SRA API test failed: ${err.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── Step 2: Detect response shape and fetch all ──
  // Determine the field names from test data
  let orgArrayKey = null;
  let totalCount = 0;

  if (Array.isArray(testData)) {
    // Response is a direct array
    orgArrayKey = '__direct_array__';
  } else {
    for (const key of Object.keys(testData || {})) {
      if (Array.isArray(testData[key])) {
        orgArrayKey = key;
      } else if (typeof testData[key] === 'number' && testData[key] > 10) {
        totalCount = testData[key];
      }
    }
  }

  if (!orgArrayKey) {
    console.error('Could not detect organisation array in API response.');
    console.error('Response:', JSON.stringify(testData, null, 2).substring(0, 3000));
    await mongoose.disconnect();
    process.exit(1);
  }

  const firstPageOrgs = orgArrayKey === '__direct_array__'
    ? testData
    : testData[orgArrayKey];

  console.log(`\nDetected: ${totalCount || 'unknown'} total organisations`);
  console.log(`First page returned ${firstPageOrgs.length} organisations`);

  // Determine if we need pagination
  const needsPagination = totalCount > firstPageOrgs.length;
  console.log(`Pagination needed: ${needsPagination ? 'YES' : 'NO (all in one response)'}`);

  // ── Step 3: Fetch all pages ──
  let allOrgs = [...firstPageOrgs];

  if (needsPagination) {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    console.log(`\nFetching ${totalPages} pages (${PAGE_SIZE}/page)...`);

    // We already have page 1, fetch the rest
    for (let page = 2; page <= totalPages; page++) {
      try {
        const data = await fetchPage(page);
        const orgs = orgArrayKey === '__direct_array__' ? data : data[orgArrayKey];
        if (!orgs || orgs.length === 0) {
          console.log(`  Page ${page}: empty — stopping pagination`);
          break;
        }
        allOrgs.push(...orgs);
        if (page % 10 === 0 || page === totalPages) {
          console.log(`  Fetched page ${page}/${totalPages} — ${allOrgs.length} total orgs so far`);
        }
        // Small delay to be respectful
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`  Failed to fetch page ${page} after retries: ${err.message}`);
      }
    }
  }

  console.log(`\nTotal organisations fetched: ${allOrgs.length}`);

  // ── Step 4: Filter and import ──
  const stats = {
    total: allOrgs.length,
    imported: 0,
    skippedNotAuthorised: 0,
    skippedExistingSra: 0,
    skippedNoOffice: 0,
    skippedNoTown: 0,
    skippedNotEnglandWales: 0,
    skippedDuplicateEmail: 0,
    skippedBuildFailed: 0,
    skippedInsertError: 0,
    errors: [],
    cityCounts: {},
    practiceAreaCounts: {},
  };

  // Detect the authorisation status value from the data
  const statusValues = new Set();
  for (const org of allOrgs.slice(0, 100)) {
    if (org.AuthorisationStatus) statusValues.add(org.AuthorisationStatus);
  }
  console.log(`\nAuthorisation status values found: ${[...statusValues].join(', ')}`);

  // Accept valid authorisation statuses
  const validStatuses = new Set(['Authorised', 'Active', 'authorised', 'active', 'YES', 'Yes', 'yes']);

  const toImport = [];
  const slugsSeen = new Set();

  // Pre-load existing slugs
  const existingSlugs = new Set(
    (await Vendor.find({ slug: { $exists: true } }).select('slug').lean())
      .map(v => v.slug)
      .filter(Boolean)
  );

  for (const org of allOrgs) {
    // Check authorisation
    if (!validStatuses.has(org.AuthorisationStatus)) {
      stats.skippedNotAuthorised++;
      continue;
    }

    // Check offices exist
    if (!org.Offices || org.Offices.length === 0) {
      stats.skippedNoOffice++;
      continue;
    }

    // Check SRA number not already imported
    const sraNum = String(org.SraNumber || org.Id || '');
    if (existingSra.has(sraNum)) {
      stats.skippedExistingSra++;
      continue;
    }

    // Build vendor doc
    const doc = buildVendorDoc(org);
    if (!doc) {
      // buildVendorDoc returns null for no town, not England/Wales, etc.
      const office = pickOffice(org.Offices);
      const town = office ? (office.Town || '').trim() : '';
      const country = office ? (office.Country || '').trim() : '';
      if (!town) {
        stats.skippedNoTown++;
      } else if (country && !['England', 'Wales'].includes(country)) {
        stats.skippedNotEnglandWales++;
      } else {
        stats.skippedBuildFailed++;
      }
      continue;
    }

    // Check email uniqueness
    if (existingEmails.has(doc.email)) {
      stats.skippedDuplicateEmail++;
      continue;
    }

    // Ensure slug is unique
    let slug = doc.slug;
    let slugSuffix = 1;
    while (existingSlugs.has(slug) || slugsSeen.has(slug)) {
      slug = `${doc.slug}-${slugSuffix}`;
      slugSuffix++;
    }
    doc.slug = slug;
    slugsSeen.add(slug);
    existingEmails.add(doc.email);
    existingSra.add(doc.sraNumber);

    toImport.push(doc);

    // Track stats
    const city = doc.location.city;
    stats.cityCounts[city] = (stats.cityCounts[city] || 0) + 1;
    for (const pa of doc.practiceAreas) {
      stats.practiceAreaCounts[pa] = (stats.practiceAreaCounts[pa] || 0) + 1;
    }

    if (toImport.length >= IMPORT_LIMIT) break;
  }

  console.log(`\nReady to import: ${toImport.length} firms`);
  console.log(`Skipped: not authorised=${stats.skippedNotAuthorised}, existing SRA=${stats.skippedExistingSra}, no office=${stats.skippedNoOffice}, no town=${stats.skippedNoTown}, not England/Wales=${stats.skippedNotEnglandWales}, duplicate email=${stats.skippedDuplicateEmail}, build failed=${stats.skippedBuildFailed}`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN — not inserting into database ---');
    console.log(`Would import ${toImport.length} solicitor firms.`);
    if (toImport.length > 0) {
      console.log('\nSample record:');
      console.log(JSON.stringify(toImport[0], null, 2));
    }
  } else {
    // ── Step 5: Bulk insert ──
    console.log('\nInserting into MongoDB...');
    const BATCH_SIZE = 500;

    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE);
      try {
        const result = await Vendor.insertMany(batch, { ordered: false });
        stats.imported += result.length;
      } catch (err) {
        // insertMany with ordered:false continues on errors
        if (err.insertedDocs) {
          stats.imported += err.insertedDocs.length;
        }
        if (err.writeErrors) {
          for (const we of err.writeErrors) {
            stats.skippedInsertError++;
            stats.errors.push(`${batch[we.index]?.company || 'unknown'}: ${we.errmsg?.substring(0, 100)}`);
          }
        } else {
          // Fallback: count successful from result
          stats.skippedInsertError += batch.length;
          stats.errors.push(err.message?.substring(0, 200));
        }
      }

      if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= toImport.length) {
        console.log(`  Inserted ${Math.min(i + BATCH_SIZE, toImport.length)}/${toImport.length} — ${stats.imported} successful`);
      }
    }
  }

  // ── Step 6: Print results ──
  console.log('\n====================================');
  console.log('         IMPORT RESULTS');
  console.log('====================================');
  console.log(`Total SRA orgs fetched:   ${stats.total}`);
  console.log(`Imported:                 ${DRY_RUN ? `${toImport.length} (dry run)` : stats.imported}`);
  console.log(`Skipped - not authorised: ${stats.skippedNotAuthorised}`);
  console.log(`Skipped - existing SRA:   ${stats.skippedExistingSra}`);
  console.log(`Skipped - no office:      ${stats.skippedNoOffice}`);
  console.log(`Skipped - no town:        ${stats.skippedNoTown}`);
  console.log(`Skipped - not Eng/Wales:  ${stats.skippedNotEnglandWales}`);
  console.log(`Skipped - dup email:      ${stats.skippedDuplicateEmail}`);
  console.log(`Skipped - build failed:   ${stats.skippedBuildFailed}`);
  console.log(`Skipped - insert error:   ${stats.skippedInsertError}`);

  if (stats.errors.length > 0) {
    console.log(`\nFirst 20 errors:`);
    stats.errors.slice(0, 20).forEach(e => console.log(`  - ${e}`));
  }

  // Top 30 cities
  const topCities = Object.entries(stats.cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  console.log('\n--- Top 30 Cities ---');
  for (const [city, count] of topCities) {
    console.log(`  ${city}: ${count}`);
  }

  // Practice area breakdown
  const paBreakdown = Object.entries(stats.practiceAreaCounts)
    .sort((a, b) => b[1] - a[1]);
  console.log('\n--- Practice Areas ---');
  for (const [area, count] of paBreakdown) {
    console.log(`  ${area}: ${count}`);
  }

  // Total vendor counts
  if (!DRY_RUN) {
    const totalVendors = await Vendor.countDocuments();
    const solicitors = await Vendor.countDocuments({ vendorType: 'solicitor' });
    const officeEquip = await Vendor.countDocuments({ vendorType: 'office-equipment' });
    const distinctCities = await Vendor.distinct('location.city', { vendorType: 'solicitor' });

    console.log('\n--- Database Totals ---');
    console.log(`  Total vendors:          ${totalVendors}`);
    console.log(`  Office equipment:       ${officeEquip}`);
    console.log(`  Solicitors:             ${solicitors}`);
    console.log(`  Solicitor cities:       ${distinctCities.length}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  mongoose.disconnect();
  process.exit(1);
});
