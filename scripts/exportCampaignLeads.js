#!/usr/bin/env node

/**
 * exportCampaignLeads.js
 *
 * Export vendor profiles for email campaign outreach, enriched with
 * contact names where possible. Produces two CSV files split by whether
 * a contact first-name could be found.
 *
 * Criteria (as specified):
 *   - vendorType: "solicitor"
 *   - location.city: "Cardiff" (case-insensitive)
 *   - listingStatus: "unclaimed" OR tier: "free"
 *   - email must exist
 *   - email must not contain noreply / donotreply / no-reply
 *   - emailUnsubscribed !== true
 *   - Limit 200 records
 *
 * Output:
 *   /exports/cardiff_solicitors_named.csv   (firstName is not blank)
 *   /exports/cardiff_solicitors_unnamed.csv (firstName is blank)
 *
 * Usage: node scripts/exportCampaignLeads.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Vendor from '../models/Vendor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(PROJECT_ROOT, 'exports');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('ERROR: MONGODB_URI (or MONGO_URI) environment variable is required');
  process.exit(1);
}

// ---------- Helpers ----------

const TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx',
  'dr', 'prof', 'professor',
  'sir', 'dame', 'lord', 'lady',
  'rev', 'reverend', 'hon', 'honourable',
]);

/**
 * Clean and title-case a single name component (strip titles, punctuation).
 */
function cleanName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // Normalise whitespace, strip trailing punctuation from each token
  const tokens = raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(t => t.replace(/[.,;:]+$/g, ''))
    .filter(Boolean);

  // Drop leading titles (can be multiple e.g. "Dr Prof")
  while (tokens.length && TITLES.has(tokens[0].toLowerCase().replace(/\./g, ''))) {
    tokens.shift();
  }
  return tokens.join(' ');
}

function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(/(\s|-)/) // keep spaces and hyphens as separators
    .map(part => {
      if (part === ' ' || part === '-') return part;
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

/**
 * Split a full name into { firstName, lastName }, after title stripping.
 */
function splitName(raw) {
  const cleaned = cleanName(raw);
  if (!cleaned) return { firstName: '', lastName: '' };
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: toTitleCase(parts[0]), lastName: '' };
  const firstName = toTitleCase(parts[0]);
  const lastName = toTitleCase(parts.slice(1).join(' '));
  return { firstName, lastName };
}

/**
 * Find a contact name for a vendor, trying each source in order.
 * Returns { name: string, source: string }.
 */
function findContactName(vendor) {
  // Spec step 2 — check each field in order
  if (vendor.contactName) return { name: vendor.contactName, source: 'contactName' };
  if (vendor.directorName) return { name: vendor.directorName, source: 'directorName' };
  if (vendor.claimedBy?.name) return { name: vendor.claimedBy.name, source: 'claimedBy.name' };
  if (Array.isArray(vendor.partners) && vendor.partners[0]?.name) {
    return { name: vendor.partners[0].name, source: 'partners[0].name' };
  }

  // Additional fallback — vendor.name is the required top-level contact name
  // field in the actual schema (not in the user's spec but present in reality).
  if (vendor.name) return { name: vendor.name, source: 'vendor.name (schema fallback)' };

  return { name: '', source: '' };
}

/**
 * Spec step 3 — SRA enrichment: if still no name and vendor has sraNumber,
 * check individualSolicitors[] (the SRA principals / authorised persons field).
 */
function findSraContactName(vendor) {
  if (!vendor.sraNumber) return { name: '', source: '' };
  if (Array.isArray(vendor.individualSolicitors)) {
    const firstWithName = vendor.individualSolicitors.find(s => s?.name);
    if (firstWithName) {
      return { name: firstWithName.name, source: 'individualSolicitors[0].name (SRA)' };
    }
  }
  return { name: '', source: '' };
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(headers, rows) {
  const out = [headers.join(',')];
  for (const row of rows) {
    out.push(headers.map(h => csvEscape(row[h])).join(','));
  }
  return out.join('\n') + '\n';
}

// ---------- Main ----------

async function main() {
  console.log('=== Cardiff Solicitors Campaign Export ===\n');

  // Suppression collection check — FLAG BEFORE QUERYING
  const suppressionModels = ['SuppressedEmail', 'Unsubscribe', 'EmailSuppression'];
  const modelNames = Object.keys(mongoose.models);
  const foundSuppression = suppressionModels.find(name =>
    modelNames.includes(name) ||
    fs.existsSync(path.join(PROJECT_ROOT, 'models', `${name}.js`))
  );

  if (foundSuppression) {
    console.log(`✓ Suppression collection found: ${foundSuppression}`);
  } else {
    console.log('⚠  NO dedicated suppression collection found (SuppressedEmail / Unsubscribe).');
    console.log('   Falling back to vendor.emailUnsubscribed boolean field only.');
    console.log('   RECOMMENDATION: create a SuppressedEmail collection before sending.\n');
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  // ---------- STEP 1: Query vendors ----------
  const query = {
    vendorType: 'solicitor',
    'location.city': { $regex: /^cardiff$/i },
    $or: [
      { listingStatus: 'unclaimed' },
      { tier: 'free' },
    ],
    email: { $exists: true, $nin: [null, ''] },
    emailUnsubscribed: { $ne: true },
  };

  // Count before exclusions so we can report "excluded" figures
  const totalBeforeEmailFilter = await Vendor.countDocuments({
    vendorType: 'solicitor',
    'location.city': { $regex: /^cardiff$/i },
    $or: [
      { listingStatus: 'unclaimed' },
      { tier: 'free' },
    ],
  });

  const unsubscribedCount = await Vendor.countDocuments({
    vendorType: 'solicitor',
    'location.city': { $regex: /^cardiff$/i },
    $or: [
      { listingStatus: 'unclaimed' },
      { tier: 'free' },
    ],
    emailUnsubscribed: true,
  });

  const missingEmailCount = await Vendor.countDocuments({
    vendorType: 'solicitor',
    'location.city': { $regex: /^cardiff$/i },
    $and: [
      { $or: [{ listingStatus: 'unclaimed' }, { tier: 'free' }] },
      { $or: [{ email: { $exists: false } }, { email: null }, { email: '' }] },
    ],
  });

  const candidates = await Vendor.find(query)
    .limit(200)
    .lean();

  // Filter out role-style addresses
  const BLOCKED_LOCALPARTS = /(noreply|donotreply|no-reply)/i;
  const roleExcluded = [];
  const kept = [];
  for (const v of candidates) {
    if (BLOCKED_LOCALPARTS.test(v.email || '')) {
      roleExcluded.push(v);
    } else {
      kept.push(v);
    }
  }

  console.log(`STEP 1 — Query results:`);
  console.log(`  Total matching criteria (pre-exclusions): ${totalBeforeEmailFilter}`);
  console.log(`  Excluded — emailUnsubscribed=true:        ${unsubscribedCount}`);
  console.log(`  Excluded — missing/empty email:           ${missingEmailCount}`);
  console.log(`  Candidates retrieved (limit 200):         ${candidates.length}`);
  console.log(`  Excluded — role address (noreply/etc):    ${roleExcluded.length}`);
  console.log(`  Kept after role-address filter:           ${kept.length}\n`);

  // ---------- STEPS 2 + 3: Find contact name ----------
  const errors = [];
  const named = [];
  const unnamed = [];
  const sourceCounts = {};

  for (const v of kept) {
    try {
      let contact = findContactName(v);

      // Step 3 — SRA enrichment if still blank
      if (!contact.name) {
        const sra = findSraContactName(v);
        if (sra.name) contact = sra;
      }

      const { firstName, lastName } = splitName(contact.name);

      const row = {
        email: (v.email || '').toLowerCase().trim(),
        firstName,
        lastName,
        firmName: v.company || '',
        city: 'Cardiff',
        sraNumber: v.sraNumber || '',
        vendorId: String(v._id),
        tier: v.tier || '',
      };

      const key = contact.source || '(none)';
      sourceCounts[key] = (sourceCounts[key] || 0) + 1;

      if (firstName) {
        named.push(row);
      } else {
        unnamed.push(row);
      }
    } catch (err) {
      errors.push({ vendorId: String(v._id), error: err.message });
    }
  }

  // ---------- STEP 4 + 5: Write CSVs ----------
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }

  const headers = ['email', 'firstName', 'lastName', 'firmName', 'city', 'sraNumber', 'vendorId', 'tier'];
  const namedPath = path.join(EXPORTS_DIR, 'cardiff_solicitors_named.csv');
  const unnamedPath = path.join(EXPORTS_DIR, 'cardiff_solicitors_unnamed.csv');

  fs.writeFileSync(namedPath, rowsToCsv(headers, named));
  fs.writeFileSync(unnamedPath, rowsToCsv(headers, unnamed));

  // ---------- STEP 6: Summary ----------
  console.log('STEP 2-3 — Name resolution:');
  for (const [source, count] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source.padEnd(42)} ${count}`);
  }
  console.log('');

  console.log('=== FINAL SUMMARY ===');
  console.log(`Total candidates processed:    ${kept.length}`);
  console.log(`  With firstName (named):      ${named.length}`);
  console.log(`  Without firstName (unnamed): ${unnamed.length}`);
  console.log(`Errors during processing:      ${errors.length}`);
  console.log('');
  console.log('Exclusions breakdown:');
  console.log(`  emailUnsubscribed:           ${unsubscribedCount}`);
  console.log(`  missing/empty email:         ${missingEmailCount}`);
  console.log(`  role address (noreply etc):  ${roleExcluded.length}`);
  console.log('');
  console.log('Output files:');
  console.log(`  ${namedPath}`);
  console.log(`  ${unnamedPath}`);

  if (errors.length) {
    console.log('\nErrors:');
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.vendorId}: ${e.error}`);
    }
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  if (!foundSuppression) {
    console.log('\n⚠  REMINDER: No SuppressedEmail/Unsubscribe collection exists.');
    console.log('   Create one before sending this campaign.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
