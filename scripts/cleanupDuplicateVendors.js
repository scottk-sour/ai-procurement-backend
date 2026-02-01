/**
 * Cleanup Duplicate Vendors Script
 *
 * Removes duplicate vendors created by import mismatches and test accounts.
 *
 * Usage:
 *   node scripts/cleanupDuplicateVendors.js --dry-run
 *   node scripts/cleanupDuplicateVendors.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import Vendor from '../models/Vendor.js';

// Test account patterns to delete
const TEST_EMAIL_PATTERNS = ['@test.com', '@me.com'];
const TEST_COMPANY_PREFIXES = ['test', 'debug', 'atest', 'ctest', 'vatest', 'scott1', 'scotttest'];

// Real business email domains to protect (never delete these)
const PROTECTED_DOMAINS = [
  '@sitgroup.co.uk', '@ardigital.co.uk', '@pcsgroupltd.co.uk', '@cardiffphotocopiers.com',
  '@aurora.co.uk', '@clarity-copiers.co.uk', '@dsi-tech.co.uk', '@print-logic.com',
  '@laniersouthwest.co.uk', '@south-west-copiers.co.uk', '@claritysolutions.co.uk',
  '@camelott.co.uk', '@elmrep.co.uk', '@mmbt.co.uk', '@magenta-tech.com',
  '@dolphintec.co.uk', '@signmastersystems.co.uk', '@redmachines.co.uk',
  '@ascari-office.co.uk', '@tech-wales.co.uk', '@kefcom.net', '@bytesdigital.co.uk',
  '@firstclasscomms.co.uk', '@devoncomms.co.uk', '@equationsvoiceanddata.co.uk',
  '@fmcomms.co.uk', '@copiersdirect.co.uk'
];

async function cleanupVendors(dryRun = true) {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   VENDOR CLEANUP SCRIPT                ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE DELETE'}\n`);

  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable not set');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB\n');

  const results = {
    duplicatesDeleted: [],
    testAccountsDeleted: [],
    protected: [],
    errors: []
  };

  // ============================================
  // STEP 1: Find and remove duplicate vendors
  // ============================================
  console.log('═══ STEP 1: Finding duplicate vendors by company name ═══\n');

  // Aggregate to find companies with multiple entries
  const duplicates = await Vendor.aggregate([
    {
      $group: {
        _id: { $toLower: '$company' },
        count: { $sum: 1 },
        vendors: {
          $push: {
            id: '$_id',
            company: '$company',
            email: '$email',
            createdAt: '$createdAt',
            importedAt: '$importedAt',
            lastImportedAt: '$lastImportedAt'
          }
        }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]);

  console.log(`Found ${duplicates.length} companies with duplicates\n`);

  for (const dup of duplicates) {
    const vendors = dup.vendors;

    // Sort by date - newest first (prefer lastImportedAt, then importedAt, then createdAt)
    vendors.sort((a, b) => {
      const dateA = a.lastImportedAt || a.importedAt || a.createdAt || new Date(0);
      const dateB = b.lastImportedAt || b.importedAt || b.createdAt || new Date(0);
      return new Date(dateB) - new Date(dateA);
    });

    const keep = vendors[0];
    const toDelete = vendors.slice(1);

    console.log(`\n📁 "${dup._id}" (${vendors.length} records)`);
    console.log(`   ✓ KEEP: ${keep.email} (${formatDate(keep.lastImportedAt || keep.importedAt || keep.createdAt)})`);

    for (const vendor of toDelete) {
      const email = vendor.email || '';

      // Check if this is a protected real business email
      const isProtected = PROTECTED_DOMAINS.some(domain => email.toLowerCase().includes(domain));

      if (isProtected) {
        console.log(`   ⚠ PROTECTED (real email): ${email}`);
        results.protected.push({ company: vendor.company, email, reason: 'Real business email' });
        continue;
      }

      // Check if this is a timestamp-based placeholder (old import pattern)
      const isOldPlaceholder = email.includes('unclaimed-') && email.match(/unclaimed-\d{13}-\d+@tendorai\.com/);

      // Check if this is a name-based placeholder (new import pattern)
      const isNewPlaceholder = email.includes('unclaimed-') && !isOldPlaceholder;

      // Only delete old timestamp placeholders, not real emails
      if (isOldPlaceholder || (isNewPlaceholder && vendors.indexOf(vendor) > 0)) {
        console.log(`   ✗ DELETE: ${email} (${formatDate(vendor.importedAt || vendor.createdAt)})`);

        if (!dryRun) {
          try {
            await Vendor.findByIdAndDelete(vendor.id);
            results.duplicatesDeleted.push({ company: vendor.company, email });
          } catch (err) {
            results.errors.push({ company: vendor.company, email, error: err.message });
          }
        } else {
          results.duplicatesDeleted.push({ company: vendor.company, email });
        }
      } else {
        console.log(`   ⚠ SKIP (not a placeholder): ${email}`);
      }
    }
  }

  // ============================================
  // STEP 2: Delete test/debug accounts
  // ============================================
  console.log('\n\n═══ STEP 2: Finding test/debug accounts ═══\n');

  // Build query for test accounts
  const testAccountQuery = {
    $or: [
      // Email patterns
      ...TEST_EMAIL_PATTERNS.map(pattern => ({
        email: { $regex: pattern.replace('.', '\\.'), $options: 'i' }
      })),
      // Company name prefixes
      ...TEST_COMPANY_PREFIXES.map(prefix => ({
        company: { $regex: `^${prefix}`, $options: 'i' }
      }))
    ]
  };

  const testAccounts = await Vendor.find(testAccountQuery).select('company email createdAt');

  console.log(`Found ${testAccounts.length} test/debug accounts\n`);

  for (const vendor of testAccounts) {
    const email = vendor.email || '';

    // Double-check: never delete protected real business emails
    const isProtected = PROTECTED_DOMAINS.some(domain => email.toLowerCase().includes(domain));

    if (isProtected) {
      console.log(`⚠ PROTECTED: "${vendor.company}" (${email})`);
      results.protected.push({ company: vendor.company, email, reason: 'Real business email' });
      continue;
    }

    console.log(`✗ DELETE: "${vendor.company}" (${email})`);

    if (!dryRun) {
      try {
        await Vendor.findByIdAndDelete(vendor._id);
        results.testAccountsDeleted.push({ company: vendor.company, email });
      } catch (err) {
        results.errors.push({ company: vendor.company, email, error: err.message });
      }
    } else {
      results.testAccountsDeleted.push({ company: vendor.company, email });
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║           CLEANUP SUMMARY              ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log(`Duplicate vendors ${dryRun ? 'to delete' : 'deleted'}: ${results.duplicatesDeleted.length}`);
  if (results.duplicatesDeleted.length > 0) {
    results.duplicatesDeleted.slice(0, 10).forEach(v => {
      console.log(`  - ${v.company} (${v.email})`);
    });
    if (results.duplicatesDeleted.length > 10) {
      console.log(`  ... and ${results.duplicatesDeleted.length - 10} more`);
    }
  }

  console.log(`\nTest accounts ${dryRun ? 'to delete' : 'deleted'}: ${results.testAccountsDeleted.length}`);
  if (results.testAccountsDeleted.length > 0) {
    results.testAccountsDeleted.slice(0, 10).forEach(v => {
      console.log(`  - ${v.company} (${v.email})`);
    });
    if (results.testAccountsDeleted.length > 10) {
      console.log(`  ... and ${results.testAccountsDeleted.length - 10} more`);
    }
  }

  console.log(`\nProtected (not deleted): ${results.protected.length}`);
  console.log(`Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => {
      console.log(`  - ${e.company}: ${e.error}`);
    });
  }

  const totalDeleted = results.duplicatesDeleted.length + results.testAccountsDeleted.length;

  if (dryRun) {
    console.log(`\n⚠️  DRY RUN - No changes made. ${totalDeleted} vendors would be deleted.`);
    console.log('   Run without --dry-run to actually delete.\n');
  } else {
    console.log(`\n✓ Cleanup complete. ${totalDeleted} vendors deleted.\n`);
  }

  await mongoose.disconnect();
  console.log('✓ Disconnected from MongoDB\n');

  return results;
}

function formatDate(date) {
  if (!date) return 'No date';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

// CLI
const dryRun = process.argv.includes('--dry-run');

cleanupVendors(dryRun)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n✗ Cleanup failed:', err.message);
    process.exit(1);
  });
