// scripts/cleanupVendorStatuses.js
// Resets all vendors to "unclaimed" except protected accounts,
// and deletes test/smoke/diagnostic accounts entirely.
//
// Usage:
//   node scripts/cleanupVendorStatuses.js          (dry-run)
//   node scripts/cleanupVendorStatuses.js --apply   (apply changes)

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment');
  process.exit(1);
}

const applyChanges = process.argv.includes('--apply');

// Accounts to keep active (exact match, case-insensitive)
const PROTECTED_EMAILS = [
  'demo@tendorai.com',
  'nathan@ascari-office.co.uk',
  'alex@ascari-office.co.uk',
  'admin@tendorai.com',
];

// Patterns for test accounts to DELETE entirely
const DELETE_PATTERNS = [
  /test/i,
  /smoke/i,
  /diag/i,
  /@example\.com$/i,
];

function isProtected(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  // Exact protected emails
  if (PROTECTED_EMAILS.some(p => p.toLowerCase() === lower)) return true;
  // demo-*@tendorai.com pattern
  if (/^demo-.*@tendorai\.com$/i.test(email)) return true;
  return false;
}

function isTestAccount(email) {
  if (!email) return false;
  return DELETE_PATTERNS.some(pattern => pattern.test(email));
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const vendorsCol = db.collection('vendors');

  // Fetch ALL vendors
  const allVendors = await vendorsCol.find({}, {
    projection: { email: 1, company: 1, name: 1, status: 1, 'account.status': 1, listingStatus: 1 }
  }).toArray();

  console.log(`Total vendors in database: ${allVendors.length}\n`);

  // Categorise
  const kept = [];
  const toReset = [];
  const toDelete = [];

  for (const v of allVendors) {
    const email = v.email || '';
    if (isProtected(email)) {
      kept.push(v);
    } else if (isTestAccount(email)) {
      toDelete.push(v);
    } else {
      toReset.push(v);
    }
  }

  // --- Report ---

  console.log('=== ACCOUNTS TO KEEP (active) ===');
  if (kept.length === 0) {
    console.log('  (none)\n');
  } else {
    kept.forEach(v => {
      const status = v.account?.status || v.status || 'unknown';
      console.log(`  - ${v.email} (${v.company || v.name || 'no name'}) [${status}]`);
    });
    console.log(`  Total: ${kept.length}\n`);
  }

  console.log('=== TEST ACCOUNTS TO DELETE ===');
  if (toDelete.length === 0) {
    console.log('  (none)\n');
  } else {
    toDelete.forEach(v => {
      console.log(`  - ${v.email} (${v.company || v.name || 'no name'})`);
    });
    console.log(`  Total: ${toDelete.length}\n`);
  }

  console.log('=== VENDORS TO RESET TO UNCLAIMED ===');
  const sample = toReset.slice(0, 15);
  sample.forEach(v => {
    console.log(`  - ${v.email} (${v.company || v.name || 'no name'})`);
  });
  if (toReset.length > 15) {
    console.log(`  ... and ${toReset.length - 15} more`);
  }
  console.log(`  Total: ${toReset.length}\n`);

  console.log('--- SUMMARY ---');
  console.log(`  Keep active:       ${kept.length}`);
  console.log(`  Reset to unclaimed: ${toReset.length}`);
  console.log(`  Delete entirely:   ${toDelete.length}`);
  console.log(`  Total:             ${allVendors.length}\n`);

  if (!applyChanges) {
    console.log('DRY RUN — no changes made.');
    console.log('Run with --apply to execute.');
    await mongoose.disconnect();
    return;
  }

  // --- Apply changes ---
  console.log('Applying changes...\n');

  // 1. Reset vendors to unclaimed
  if (toReset.length > 0) {
    const resetIds = toReset.map(v => v._id);
    const resetResult = await vendorsCol.updateMany(
      { _id: { $in: resetIds } },
      {
        $set: {
          status: 'unclaimed',
          'account.status': 'pending',
          listingStatus: 'unclaimed',
        },
        $unset: {
          password: '',
        },
      }
    );
    console.log(`Reset ${resetResult.modifiedCount} vendors to unclaimed (password removed)`);
  }

  // 2. Delete test accounts
  if (toDelete.length > 0) {
    const deleteIds = toDelete.map(v => v._id);
    const deleteResult = await vendorsCol.deleteMany(
      { _id: { $in: deleteIds } }
    );
    console.log(`Deleted ${deleteResult.deletedCount} test accounts`);
  }

  console.log('\nDone. All profile data preserved for reset vendors.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
