#!/usr/bin/env node

/**
 * Migrate existing Pro vendors to FirmFacts.
 *
 * For every Vendor with tier in ['managed','verified','enterprise'],
 * creates an empty FirmFacts doc (if none exists) and populates
 * identity fields from the Vendor document.
 *
 * Idempotent — running twice writes zero new documents.
 *
 * Usage: node scripts/migrateExistingVendorsToFirmFacts.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import FirmFacts from '../models/FirmFacts.js';

const PRO_TIERS = ['managed', 'verified', 'enterprise'];

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

async function main() {
  console.log('=== Migrate Existing Vendors to FirmFacts ===\n');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const vendors = await Vendor.find({ tier: { $in: PRO_TIERS } })
    .select('_id company vendorType location practiceAreas sraNumber icaewFirmNumber fcaNumber propertymarkNumber')
    .lean();

  console.log(`Found ${vendors.length} Pro vendor(s).\n`);

  let created = 0;
  let alreadyExisted = 0;
  let errors = 0;

  for (const vendor of vendors) {
    try {
      const existing = await FirmFacts.findOne({ vendorId: vendor._id });
      if (existing) {
        alreadyExisted++;
        console.log(`  [exists] ${vendor.company} — FirmFacts already exists`);
        continue;
      }

      const regNumber =
        vendor.sraNumber ||
        vendor.icaewFirmNumber ||
        vendor.fcaNumber ||
        vendor.propertymarkNumber ||
        null;

      const doc = new FirmFacts({
        vendorId: vendor._id,
        identity: {
          firmName: { value: vendor.company || null, filledAt: new Date(), source: 'verified_register' },
          city: { value: vendor.location?.city || null, filledAt: vendor.location?.city ? new Date() : null, source: vendor.location?.city ? 'self' : null },
          vendorType: { value: vendor.vendorType || null, filledAt: new Date(), source: 'self' },
          primarySpecialism: { value: vendor.practiceAreas?.[0] || null, filledAt: vendor.practiceAreas?.[0] ? new Date() : null, source: vendor.practiceAreas?.[0] ? 'self' : null },
          yearEstablished: { value: null, filledAt: null, source: null },
        },
        stage1: {
          regulatoryNumber: { value: regNumber, filledAt: regNumber ? new Date() : null, source: regNumber ? 'verified_register' : null },
          transactionCountLastYear: { value: null, filledAt: null, source: null },
          typicalAllInCost: { value: null, filledAt: null, source: null },
        },
      });

      await doc.save();
      created++;

      const filledCount = [vendor.company, vendor.location?.city, vendor.vendorType, vendor.practiceAreas?.[0], regNumber]
        .filter(Boolean).length;
      console.log(`  [created] ${vendor.company} — ${filledCount} identity fields migrated`);
    } catch (err) {
      errors++;
      console.error(`  [error] ${vendor.company}: ${err.message}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Created:        ${created}`);
  console.log(`Already existed: ${alreadyExisted}`);
  console.log(`Errors:         ${errors}`);

  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1]?.endsWith('migrateExistingVendorsToFirmFacts.js')) {
  main().catch(err => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });
}
