import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  const adams = await Vendor.findOne({ company: /adams harrison/i })
    .select('_id company tier vendorType subscriptionStatus').lean();
  console.log('=== Adams Harrison ===');
  console.log(JSON.stringify(adams, null, 2));

  const proVendors = await Vendor.find({
    tier: { $in: ['pro', 'managed', 'verified', 'enterprise'] }
  }).select('_id company tier vendorType subscriptionStatus').lean();
  console.log('=== Pro-tier vendors ===');
  console.log('Count:', proVendors.length);
  proVendors.forEach(v => {
    console.log('  -', v.company, '|', v.tier, '|', v.vendorType, '|', v.subscriptionStatus, '| _id:', v._id.toString());
  });

  const targetNames = [/david tang/i, /nadine wong/i, /thomas andrew/i];
  console.log('=== Specific Pro customers from memory ===');
  for (const pattern of targetNames) {
    const v = await Vendor.findOne({ company: pattern })
      .select('_id company tier vendorType subscriptionStatus').lean();
    if (v) {
      console.log('  Found:', v.company, '|', v.tier, '|', v.vendorType, '| _id:', v._id.toString());
    } else {
      console.log('  NOT FOUND for pattern:', pattern.toString());
    }
  }

  await mongoose.disconnect();
  console.log('Disconnected.');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
