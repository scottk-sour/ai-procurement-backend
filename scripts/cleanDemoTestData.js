/**
 * Clean Demo Vendor Test Data
 * Removes test analytics events and test leads for the demo vendor,
 * and fixes the demo vendor profile (description, website).
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DEMO_EMAIL = 'demo@tendorai.com';
const DEMO_VENDOR_ID = '697e212e7df418c53adbfafc';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db;

  // 1. Delete ALL VendorAnalytics events for the demo vendor
  console.log('=== CLEANING ANALYTICS ===');
  const analyticsResult = await db.collection('vendor_analytics').deleteMany({
    vendorId: new mongoose.Types.ObjectId(DEMO_VENDOR_ID)
  });
  console.log(`Deleted ${analyticsResult.deletedCount} analytics events for demo vendor.\n`);

  // 2. Delete test leads for the demo vendor
  console.log('=== CLEANING TEST LEADS ===');
  const testPatterns = /test|demo|secret|fix|verify|example\.com|diagnostic/i;

  const leads = await db.collection('vendorleads').find({
    vendor: new mongoose.Types.ObjectId(DEMO_VENDOR_ID)
  }).toArray();

  console.log(`Found ${leads.length} total leads for demo vendor.`);

  const testLeadIds = [];
  for (const lead of leads) {
    const customerName = lead.customer?.contactName || '';
    const companyName = lead.customer?.companyName || '';
    const email = lead.customer?.email || '';
    const combined = `${customerName} ${companyName} ${email}`;

    if (testPatterns.test(combined)) {
      testLeadIds.push(lead._id);
      console.log(`  TEST: "${companyName}" / "${customerName}" / ${email} — will delete`);
    } else {
      console.log(`  KEEP: "${companyName}" / "${customerName}" / ${email}`);
    }
  }

  if (testLeadIds.length > 0) {
    const leadResult = await db.collection('vendorleads').deleteMany({
      _id: { $in: testLeadIds }
    });
    console.log(`\nDeleted ${leadResult.deletedCount} test leads.`);
  } else {
    console.log('\nNo test leads to delete.');
  }

  // 3. Fix demo vendor profile
  console.log('\n=== FIXING DEMO VENDOR PROFILE ===');
  const vendor = await db.collection('vendors').findOne({
    email: DEMO_EMAIL
  });

  if (vendor) {
    const updates = {};

    // Fix empty description
    if (!vendor.businessProfile?.description || vendor.businessProfile.description.length < 20) {
      updates['businessProfile.description'] = 'Demo supplier account for TendorAI platform testing. This is not a real business.';
      console.log('Fixed: empty description');
    }

    // Fix broken website (was "https://demo@tendorai.com")
    const website = vendor.contactInfo?.website || '';
    if (!website || website.includes('@') || !website.startsWith('http')) {
      updates['contactInfo.website'] = 'https://www.tendorai.com';
      console.log(`Fixed: broken website (was "${website}")`);
    }

    if (Object.keys(updates).length > 0) {
      await db.collection('vendors').updateOne(
        { _id: vendor._id },
        { $set: updates }
      );
      console.log('Profile updated.');
    } else {
      console.log('No profile fixes needed.');
    }
  } else {
    console.log('Demo vendor not found!');
  }

  // 4. Show final state
  console.log('\n=== FINAL STATE ===');
  const remainingAnalytics = await db.collection('vendor_analytics').countDocuments({
    vendorId: new mongoose.Types.ObjectId(DEMO_VENDOR_ID)
  });
  const remainingLeads = await db.collection('vendorleads').countDocuments({
    vendor: new mongoose.Types.ObjectId(DEMO_VENDOR_ID)
  });
  console.log(`Analytics events remaining: ${remainingAnalytics}`);
  console.log(`Leads remaining: ${remainingLeads}`);

  const updatedVendor = await db.collection('vendors').findOne({ email: DEMO_EMAIL });
  console.log(`Description: "${updatedVendor?.businessProfile?.description || 'EMPTY'}"`);
  console.log(`Website: "${updatedVendor?.contactInfo?.website || 'EMPTY'}"`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
