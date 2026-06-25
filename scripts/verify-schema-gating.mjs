import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

await mongoose.connect(uri);

const Vendor = (await import('../models/Vendor.js')).default;
const { generateVendorSchema } = await import('../utils/generateVendorSchema.js');

const CARDIFF_ID = '699757a97712b4369510e6c8';

console.log('=== DEMO VENDOR: Cardiff Property Partners ===');
const cardiff = await Vendor.findById(CARDIFF_ID).lean();
if (!cardiff) {
  console.log('Cardiff not found');
} else {
  const schema = generateVendorSchema(cardiff);
  const ids = (schema.identifier || []).filter(i => ['SRA Number', 'FCA Number', 'ICAEW Firm Number', 'Propertymark Number', 'TendorAI Verified'].includes(i.name));
  console.log('Regulator identifiers:', JSON.stringify(ids, null, 2));
  console.log('Expected: PM-DEMO-001 present (demo bypass)');
}

console.log('\n=== FIRST NON-DEMO PRO VENDOR ===');
const proVendor = await Vendor.findOne({
  tier: 'pro',
  isDemoVendor: { $ne: true },
  isDemoAccount: { $ne: true },
}).lean();
if (!proVendor) {
  console.log('No non-demo pro vendor found');
} else {
  console.log(`Vendor: ${proVendor.company}`);
  console.log(`sraNumber: ${proVendor.sraNumber || '(none)'}`);
  console.log(`propertymarkNumber: ${proVendor.propertymarkNumber || '(none)'}`);
  console.log(`account.verificationStatus: ${proVendor.account?.verificationStatus || '(none)'}`);
  const schema = generateVendorSchema(proVendor);
  const ids = (schema.identifier || []).filter(i => ['SRA Number', 'FCA Number', 'ICAEW Firm Number', 'Propertymark Number', 'TendorAI Verified'].includes(i.name));
  console.log('Regulator identifiers emitted:', ids.length > 0 ? JSON.stringify(ids, null, 2) : 'NONE (correctly gated)');
}

await mongoose.disconnect();
