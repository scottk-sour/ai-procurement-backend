/**
 * Companies House Matching Script
 *
 * Matches vendor records to Companies House entries using name, postcode, and city.
 * Requires CH_API_KEY in .env (free from developer.company-information.service.gov.uk).
 *
 * Usage:
 *   node scripts/matchCompaniesHouse.js          # Full run
 *   node scripts/matchCompaniesHouse.js --test    # First 20 vendors, verbose, no DB writes
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

const CH_API_KEY = process.env.CH_API_KEY;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TEST_MODE = process.argv.includes('--test');
const RATE_LIMIT_MS = 500;

if (!CH_API_KEY) {
  console.error('ERROR: CH_API_KEY not set in .env');
  process.exit(1);
}

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in .env');
  process.exit(1);
}

// ─── Fuzzy name similarity (Dice coefficient on bigrams) ────────────

function bigrams(str) {
  const s = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const pairs = new Set();
  for (let i = 0; i < s.length - 1; i++) {
    pairs.add(s.slice(i, i + 2));
  }
  return pairs;
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

// ─── Companies House API search ─────────────────────────────────────

async function searchCompaniesHouse(query) {
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}&items_per_page=10`;
  const auth = Buffer.from(`${CH_API_KEY}:`).toString('base64');

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (res.status === 429) {
    // Rate limited — wait and retry once
    console.log('  Rate limited, waiting 5s...');
    await sleep(5000);
    const retry = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!retry.ok) return [];
    const data = await retry.json();
    return data.items || [];
  }

  if (!res.ok) {
    if (TEST_MODE) console.log(`  CH API error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.items || [];
}

// ─── Scoring ────────────────────────────────────────────────────────

function scoreResult(result, vendor) {
  let score = 0;
  const reasons = [];

  // Name similarity
  const nameSim = similarity(vendor.company, result.title);
  if (nameSim > 0.8) {
    score += 30;
    reasons.push(`name=${nameSim.toFixed(2)}`);
  }

  // Postcode match
  const vendorPostcode = (vendor.location?.postcode || '').toUpperCase().replace(/\s+/g, '');
  const chPostcode = (result.address?.postal_code || '').toUpperCase().replace(/\s+/g, '');
  if (vendorPostcode && chPostcode && vendorPostcode === chPostcode) {
    score += 50;
    reasons.push('postcode');
  }

  // City match
  const vendorCity = (vendor.location?.city || '').toLowerCase().trim();
  const chLocality = (result.address?.locality || '').toLowerCase().trim();
  if (vendorCity && chLocality && (vendorCity === chLocality || chLocality.includes(vendorCity) || vendorCity.includes(chLocality))) {
    score += 10;
    reasons.push('city');
  }

  // Active status
  if (result.company_status === 'active') {
    score += 10;
    reasons.push('active');
  }

  return { score, reasons, companyNumber: result.company_number, companyName: result.title };
}

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`\nCompanies House Matching Script`);
  console.log(`Mode: ${TEST_MODE ? 'TEST (20 vendors, verbose, no DB writes)' : 'PRODUCTION'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const query = { companyNumber: { $in: [null, '', undefined] } };
  const totalCount = await Vendor.countDocuments(query);
  const maxVendors = TEST_MODE ? 20 : totalCount;
  const BATCH_SIZE = 200;

  let processed = 0;
  let autoMatched = 0;
  let pending = 0;
  let skipped = 0;
  const pendingReview = [];

  for (let skip = 0; skip < maxVendors; skip += BATCH_SIZE) {
    const batch = await Vendor.find(query)
      .select({ company: 1, location: 1, companyNumber: 1 })
      .lean()
      .skip(skip)
      .limit(Math.min(BATCH_SIZE, maxVendors - skip));

    if (batch.length === 0) break;

    for (const vendor of batch) {
    processed++;

    if (!vendor.company || vendor.company.trim().length < 2) {
      skipped++;
      if (TEST_MODE) console.log(`  [${processed}] "${vendor.company}" — skipped (no name)`);
      continue;
    }

    const results = await searchCompaniesHouse(vendor.company);

    if (results.length === 0) {
      skipped++;
      if (TEST_MODE) console.log(`  [${processed}] "${vendor.company}" — no CH results`);
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    // Score all results and pick the best
    let bestMatch = null;
    for (const result of results) {
      const match = scoreResult(result, vendor);
      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
      }
    }

    if (bestMatch.score >= 80) {
      autoMatched++;
      if (TEST_MODE) {
        console.log(`  [${processed}] "${vendor.company}" → AUTO "${bestMatch.companyName}" (${bestMatch.companyNumber}) score=${bestMatch.score} [${bestMatch.reasons.join(', ')}]`);
      } else {
        await Vendor.updateOne(
          { _id: vendor._id },
          {
            $set: {
              companyNumber: bestMatch.companyNumber,
              chMatchConfidence: bestMatch.score,
              chMatchMethod: 'auto',
              chMatchedAt: new Date(),
            },
          }
        );
      }
    } else if (bestMatch.score >= 60) {
      pending++;
      pendingReview.push({
        vendorId: vendor._id.toString(),
        vendorName: vendor.company,
        chName: bestMatch.companyName,
        chNumber: bestMatch.companyNumber,
        score: bestMatch.score,
        reasons: bestMatch.reasons,
      });
      if (TEST_MODE) {
        console.log(`  [${processed}] "${vendor.company}" → PENDING "${bestMatch.companyName}" (${bestMatch.companyNumber}) score=${bestMatch.score} [${bestMatch.reasons.join(', ')}]`);
      }
    } else {
      skipped++;
      if (TEST_MODE) {
        console.log(`  [${processed}] "${vendor.company}" → SKIP best="${bestMatch.companyName}" score=${bestMatch.score}`);
      }
    }

    // Progress log every 100
    if (!TEST_MODE && processed % 100 === 0) {
      console.log(`Processed ${processed}/${totalCount} — Auto: ${autoMatched}, Pending: ${pending}, Skipped: ${skipped}`);
    }

    await sleep(RATE_LIMIT_MS);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Total processed:  ${processed}`);
  console.log(`Auto-matched:     ${autoMatched}`);
  console.log(`Pending review:   ${pending}`);
  console.log(`Skipped:          ${skipped}`);

  if (pendingReview.length > 0) {
    console.log(`\nPending review entries saved to: ch-pending-review.json`);
    const fs = await import('fs');
    fs.writeFileSync('ch-pending-review.json', JSON.stringify(pendingReview, null, 2));
  }

  console.log('\nDone.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
