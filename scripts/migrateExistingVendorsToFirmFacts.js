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
    .select('_id company vendorType location practiceAreas sraNumber icaewFirmNumber fcaNumber propertymarkNumber firmFacts')
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

      const ff = (val, src = 'self') => ({ value: val || null, filledAt: val ? new Date() : null, source: val ? src : null });
      const empty = () => ({ value: null, filledAt: null, source: null });

      // Branding fields from Vendor.firmFacts (frontend-managed subdocument)
      const brand = vendor.firmFacts || {};

      const doc = new FirmFacts({
        vendorId: vendor._id,
        identity: {
          firmName: ff(vendor.company, 'verified_register'),
          city: ff(vendor.location?.city),
          vendorType: ff(vendor.vendorType),
          primarySpecialism: ff(vendor.practiceAreas?.[0]),
          yearEstablished: brand.yearFounded ? ff(brand.yearFounded) : empty(),
        },
        stage1: {
          regulatoryNumber: ff(regNumber, 'verified_register'),
          transactionCountLastYear: empty(),
          typicalAllInCost: empty(),
        },
        stage2: {
          clientTypes: brand.clientTypes?.length ? ff(brand.clientTypes) : empty(),
          toneOfVoice: ff(brand.toneOfVoice),
          brandKeywords: brand.brandKeywords?.length ? ff(brand.brandKeywords) : empty(),
          uniqueSellingPoints: brand.uniqueSellingPoints?.length ? ff(brand.uniqueSellingPoints) : empty(),
        },
        brandIdentity: {
          partners: brand.partners?.length ? ff(brand.partners) : empty(),
          feeEarnerCount: ff(brand.feeEarnerCount),
          additionalOffices: brand.additionalOffices?.length ? ff(brand.additionalOffices) : empty(),
          awards: brand.awards?.length ? ff(brand.awards) : empty(),
          memberships: brand.memberships?.length ? ff(brand.memberships) : empty(),
          competitors: brand.competitors?.length ? ff(brand.competitors) : empty(),
        },
      });

      await doc.save();
      created++;

      const identityCount = [vendor.company, vendor.location?.city, vendor.vendorType, vendor.practiceAreas?.[0], regNumber].filter(Boolean).length;
      const brandCount = [brand.clientTypes?.length, brand.toneOfVoice, brand.brandKeywords?.length, brand.uniqueSellingPoints?.length, brand.partners?.length, brand.feeEarnerCount, brand.awards?.length, brand.memberships?.length, brand.competitors?.length].filter(Boolean).length;
      console.log(`  [created] ${vendor.company} — ${identityCount} identity + ${brandCount} branding fields migrated`);
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
