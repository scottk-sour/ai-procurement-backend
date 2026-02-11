/**
 * TendorAI Data Cleanup Script
 * Usage: node scripts/data-cleanup.js
 *
 * Fixes:
 * 1. Hides "TendorAI Demo Company" from public pages
 * 2. Removes "YOUR EMPLOYER" from Ascari Office Limited description
 * 3. Finds vendors with mismatched regions (e.g. "Cardiff, North West")
 * 4. Finds vendors with generic "Leading provider of..." descriptions
 * 5. Hides vendors with "GenericPartner" brand
 * 6. Finds/flags demo/test accounts
 *
 * Run with --dry-run to preview changes without writing.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DRY_RUN = process.argv.includes('--dry-run');

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI env var');
  process.exit(1);
}

// --- Welsh and South West region mapping ---
const CITY_REGION_MAP = {
  'cardiff': 'South Wales', 'newport': 'South Wales', 'swansea': 'South Wales',
  'bridgend': 'South Wales', 'barry': 'South Wales', 'neath': 'South Wales',
  'port talbot': 'South Wales', 'pontypridd': 'South Wales', 'cwmbran': 'South Wales',
  'caerphilly': 'South Wales', 'merthyr tydfil': 'South Wales', 'llanelli': 'South Wales',
  'rhondda': 'South Wales', 'aberdare': 'South Wales',
  'wrexham': 'North Wales',
  'bristol': 'West of England', 'bath': 'Somerset',
  'gloucester': 'Gloucestershire', 'cheltenham': 'Gloucestershire',
  'exeter': 'Devon', 'plymouth': 'Devon', 'torquay': 'Devon', 'barnstaple': 'Devon',
  'taunton': 'Somerset', 'yeovil': 'Somerset', 'weston-super-mare': 'Somerset',
  'swindon': 'Wiltshire', 'salisbury': 'Wiltshire',
  'truro': 'Cornwall',
  'poole': 'Dorset', 'bournemouth': 'Dorset',
};

const WRONG_REGIONS = [
  'North West', 'North East', 'Yorkshire', 'East Midlands', 'West Midlands',
  'East of England', 'South East', 'London', 'Scotland', 'Northern Ireland',
];

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Connecting to MongoDB...`);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const Vendor = mongoose.connection.collection('vendors');

  // --- 1. Hide demo company ---
  console.log('=== 1. Demo Company Cleanup ===');
  const demoVendors = await Vendor.find({
    $or: [
      { company: { $regex: /demo/i } },
      { company: { $regex: /test/i } },
      { isDemoVendor: true },
      { 'businessProfile.description': { $regex: /demo|test account|placeholder/i } },
    ],
  }).toArray();

  console.log(`Found ${demoVendors.length} demo/test vendors:`);
  for (const v of demoVendors) {
    console.log(`  - ${v.company} (${v._id}) tier=${v.tier} status=${v.account?.status}`);
    if (!DRY_RUN) {
      await Vendor.updateOne(
        { _id: v._id },
        {
          $set: {
            'account.status': 'inactive',
            'account.verificationStatus': 'unverified',
            isDemoVendor: true,
          },
        }
      );
      console.log('    → Deactivated');
    }
  }

  // --- 2. Fix "YOUR EMPLOYER" in Ascari Office Limited ---
  console.log('\n=== 2. Fix "YOUR EMPLOYER" Text ===');
  const ascariResult = await Vendor.find({
    'businessProfile.description': { $regex: /YOUR EMPLOYER/i },
  }).toArray();

  console.log(`Found ${ascariResult.length} vendors with "YOUR EMPLOYER":`);
  for (const v of ascariResult) {
    const oldDesc = v.businessProfile?.description || '';
    const newDesc = oldDesc.replace(/YOUR EMPLOYER/gi, '').replace(/\s{2,}/g, ' ').trim();
    console.log(`  - ${v.company}: "${oldDesc.substring(0, 80)}..."`);
    if (!DRY_RUN) {
      await Vendor.updateOne(
        { _id: v._id },
        { $set: { 'businessProfile.description': newDesc } }
      );
      console.log(`    → Fixed: "${newDesc.substring(0, 80)}..."`);
    }
  }

  // --- 3. Region mismatch audit ---
  console.log('\n=== 3. Region Mismatch Audit ===');
  const allVendors = await Vendor.find({
    'account.status': 'active',
    'location.city': { $exists: true, $ne: '' },
  }, {
    company: 1, 'location.city': 1, 'location.region': 1,
  }).toArray();

  let regionFixCount = 0;
  for (const v of allVendors) {
    const city = (v.location?.city || '').toLowerCase().trim();
    const currentRegion = v.location?.region || '';
    const correctRegion = CITY_REGION_MAP[city];

    if (!correctRegion) continue; // Unknown city, skip

    // Check if current region is wrong
    const isWrong = WRONG_REGIONS.some(wr =>
      currentRegion.toLowerCase().includes(wr.toLowerCase())
    );

    if (isWrong || (correctRegion && currentRegion !== correctRegion)) {
      console.log(`  - ${v.company}: ${v.location.city}, "${currentRegion}" → "${correctRegion}"`);
      regionFixCount++;
      if (!DRY_RUN) {
        await Vendor.updateOne(
          { _id: v._id },
          { $set: { 'location.region': correctRegion } }
        );
      }
    }
  }
  console.log(`${regionFixCount} region mismatches ${DRY_RUN ? 'found' : 'fixed'}.`);

  // --- 4. Generic descriptions ---
  console.log('\n=== 4. Generic Description Audit ===');
  const genericDescVendors = await Vendor.find({
    'businessProfile.description': {
      $regex: /^Leading provider of/i,
    },
  }, {
    company: 1, 'businessProfile.description': 1,
  }).toArray();

  console.log(`Found ${genericDescVendors.length} vendors with generic "Leading provider of..." descriptions:`);
  for (const v of genericDescVendors) {
    console.log(`  - ${v.company}: "${(v.businessProfile?.description || '').substring(0, 100)}"`);
  }
  if (genericDescVendors.length > 0) {
    console.log('\n  These vendors need manual content updates. IDs:');
    console.log(`  ${genericDescVendors.map(v => v._id.toString()).join(', ')}`);
  }

  // --- 5. "GenericPartner" brand cleanup ---
  console.log('\n=== 5. GenericPartner Brand Cleanup ===');
  const genericBrandVendors = await Vendor.find({
    brands: 'GenericPartner',
  }).toArray();

  console.log(`Found ${genericBrandVendors.length} vendors with "GenericPartner" brand:`);
  for (const v of genericBrandVendors) {
    console.log(`  - ${v.company}`);
    if (!DRY_RUN) {
      await Vendor.updateOne(
        { _id: v._id },
        { $pull: { brands: 'GenericPartner' } }
      );
      console.log('    → Removed GenericPartner from brands');
    }
  }

  // --- 6. Unclaimed vendors with placeholder data ---
  console.log('\n=== 6. Placeholder Data Audit ===');
  const placeholderVendors = await Vendor.find({
    listingStatus: 'unclaimed',
    $or: [
      { 'contactInfo.phone': { $regex: /^0[0-9]{3}\s?000\s?0000$/ } },
      { 'contactInfo.website': { $regex: /example\.com|placeholder|test\.com/i } },
      { 'businessProfile.description': { $regex: /lorem ipsum|placeholder|sample text/i } },
    ],
  }, {
    company: 1, 'contactInfo.phone': 1, 'contactInfo.website': 1,
  }).toArray();

  console.log(`Found ${placeholderVendors.length} unclaimed vendors with placeholder data:`);
  for (const v of placeholderVendors) {
    console.log(`  - ${v.company}: phone=${v.contactInfo?.phone || 'none'}, web=${v.contactInfo?.website || 'none'}`);
  }

  // --- Summary ---
  console.log('\n=== Summary ===');
  console.log(`Demo vendors deactivated: ${demoVendors.length}`);
  console.log(`"YOUR EMPLOYER" fixes: ${ascariResult.length}`);
  console.log(`Region mismatches: ${regionFixCount}`);
  console.log(`Generic descriptions flagged: ${genericDescVendors.length}`);
  console.log(`GenericPartner removed: ${genericBrandVendors.length}`);
  console.log(`Placeholder data flagged: ${placeholderVendors.length}`);
  console.log(`\n${DRY_RUN ? 'DRY RUN — no changes made. Remove --dry-run to apply.' : 'All changes applied.'}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
