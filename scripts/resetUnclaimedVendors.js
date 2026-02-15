// scripts/resetUnclaimedVendors.js
// Resets bulk-imported vendors with placeholder emails
// Usage:
//   node scripts/resetUnclaimedVendors.js          (dry-run)
//   node scripts/resetUnclaimedVendors.js --apply   (apply changes)

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment');
  process.exit(1);
}

const applyChanges = process.argv.includes('--apply');

const EXCLUDED_EMAILS = [
  'demo@tendorai.com',
  'nathan@ascari-office.co.uk'
];

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const vendorsCol = db.collection('vendors');

  const query = {
    email: { $regex: /^unclaimed-.*@tendorai\.com$/i },
    email: { $nin: EXCLUDED_EMAILS, $regex: /^unclaimed-.*@tendorai\.com$/i }
  };

  // Build the proper query with both conditions
  const filter = {
    $and: [
      { email: { $regex: /^unclaimed-.*@tendorai\.com$/i } },
      { email: { $nin: EXCLUDED_EMAILS } }
    ]
  };

  const vendors = await vendorsCol.find(filter, {
    projection: { email: 1, company: 1, name: 1 }
  }).toArray();

  console.log(`Found ${vendors.length} unclaimed vendors with placeholder emails\n`);

  if (vendors.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Show sample
  const sample = vendors.slice(0, 10);
  console.log('Sample vendors:');
  sample.forEach(v => {
    console.log(`  - ${v.company} (${v.email})`);
  });
  if (vendors.length > 10) {
    console.log(`  ... and ${vendors.length - 10} more\n`);
  }

  if (!applyChanges) {
    console.log('\nDRY RUN — no changes made.');
    console.log('Run with --apply to reset these vendors.');
    await mongoose.disconnect();
    return;
  }

  // Apply changes
  console.log('\nApplying changes...');

  const vendorIds = vendors.map(v => v._id);

  const result = await vendorsCol.updateMany(
    { _id: { $in: vendorIds } },
    {
      $set: {
        status: 'unclaimed',
        'account.status': 'pending',
        listingStatus: 'unclaimed'
      },
      $unset: {
        password: ''
      }
    }
  );

  console.log(`Updated ${result.modifiedCount} vendors:`);
  console.log('  - status → unclaimed');
  console.log('  - account.status → pending');
  console.log('  - listingStatus → unclaimed');
  console.log('  - password → removed');
  console.log('\nAll profile data preserved.');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
