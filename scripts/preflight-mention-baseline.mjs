import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

await mongoose.connect(uri);
const db = mongoose.connection.db;

const BROWSING_PLATFORMS = ['perplexity'];
const CARDIFF_ID = new mongoose.Types.ObjectId('699757a97712b4369510e6c8');

console.log('========================================');
console.log('1. BROWSING_PLATFORMS (from branch)');
console.log('========================================');
console.log('Value:', JSON.stringify(BROWSING_PLATFORMS));
console.log('Main has this file:', 'NO — lib/config/browsingPlatforms.js does not exist on main yet');
console.log('Main uses:', "aiModel: { $nin: ['claude-haiku'] } (old blocklist)");

console.log('\n========================================');
console.log('2. MENTION COUNTS — Cardiff Property Partners');
console.log('========================================');

const cardiffUnfiltered = await db.collection('ai_mention_scans').countDocuments({
  vendorId: CARDIFF_ID, mentioned: true,
});
const cardiffBrowsing = await db.collection('ai_mention_scans').countDocuments({
  vendorId: CARDIFF_ID, mentioned: true, aiModel: { $in: BROWSING_PLATFORMS },
});
const cardiffOldFilter = await db.collection('ai_mention_scans').countDocuments({
  vendorId: CARDIFF_ID, mentioned: true, aiModel: { $nin: ['claude-haiku'] },
});

console.log(`  No filter (current contaminated screens): ${cardiffUnfiltered}`);
console.log(`  Old filter ($nin claude-haiku):            ${cardiffOldFilter}`);
console.log(`  New filter ($in perplexity):               ${cardiffBrowsing}`);
console.log(`  Would be excluded:                         ${cardiffUnfiltered - cardiffBrowsing}`);

console.log('\n========================================');
console.log('2b. MENTION COUNTS — ALL VENDORS');
console.log('========================================');

const allUnfiltered = await db.collection('ai_mention_scans').countDocuments({ mentioned: true });
const allBrowsing = await db.collection('ai_mention_scans').countDocuments({
  mentioned: true, aiModel: { $in: BROWSING_PLATFORMS },
});
const allOldFilter = await db.collection('ai_mention_scans').countDocuments({
  mentioned: true, aiModel: { $nin: ['claude-haiku'] },
});

console.log(`  No filter (current contaminated screens): ${allUnfiltered}`);
console.log(`  Old filter ($nin claude-haiku):            ${allOldFilter}`);
console.log(`  New filter ($in perplexity):               ${allBrowsing}`);
console.log(`  Would be excluded:                         ${allUnfiltered - allBrowsing}`);

console.log('\n========================================');
console.log('2c. BREAKDOWN BY aiModel');
console.log('========================================');

const byModel = await db.collection('ai_mention_scans').aggregate([
  { $match: { mentioned: true } },
  { $group: { _id: '$aiModel', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]).toArray();
for (const r of byModel) {
  const inBrowsing = BROWSING_PLATFORMS.includes(r._id) ? '  ← KEPT' : '  ← EXCLUDED';
  console.log(`  ${String(r._id).padEnd(20)} ${String(r.count).padStart(5)}${inBrowsing}`);
}

await mongoose.disconnect();
