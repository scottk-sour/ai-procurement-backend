import mongoose from 'mongoose';
import { getFirmContext, renderFirmContextBlock } from '../services/contentPlanner/firmContext.js';
import Vendor from '../models/Vendor.js';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  let vendor = await Vendor.findOne({ company: /harrison/i }).lean();

  if (!vendor) {
    console.log('No Harrison vendor found. Trying any solicitor...');
    vendor = await Vendor.findOne({ vendorType: 'solicitor' }).lean();
  }

  if (!vendor) {
    console.log('No solicitor vendors in DB at all.');
    await mongoose.disconnect();
    return;
  }

  console.log('--------------------------------------');
  console.log('VENDOR:', vendor.company);
  console.log('VENDOR ID:', vendor._id.toString());
  console.log('VENDOR TYPE:', vendor.vendorType);
  console.log('--------------------------------------');

  console.log('=== DEBUG: raw website from DB ===');
  console.log('Value with JSON.stringify:', JSON.stringify(vendor.contactInfo?.website));
  console.log('Length:', vendor.contactInfo?.website?.length);
  console.log('Char codes:', vendor.contactInfo?.website
    ? Array.from(vendor.contactInfo.website).map(c => c.charCodeAt(0)).join(',')
    : 'null');
  console.log('Regex test:', vendor.contactInfo?.website?.match(/^\[.*?\]\((.*?)\)$/));
  console.log('=== END DEBUG ===');

  const ctx = await getFirmContext(vendor._id);
  console.log('FIRM CONTEXT JSON:');
  console.log(JSON.stringify(ctx, null, 2));
  console.log('--------------------------------------');
  console.log('RENDERED BLOCK FOR PROMPT:');
  console.log(renderFirmContextBlock(ctx));
  console.log('--------------------------------------');

  await mongoose.disconnect();
  console.log('Disconnected.');
}

main().catch(err => {
  console.error('SMOKE TEST ERROR:', err);
  process.exit(1);
});
