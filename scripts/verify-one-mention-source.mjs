import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

await mongoose.connect(uri);

const { countMentions, getBrowsingFilter } = await import('../lib/data/vendorMentions.js');
const { BROWSING_PLATFORMS } = await import('../lib/config/browsingPlatforms.js');
const db = mongoose.connection.db;

console.log('BROWSING_PLATFORMS:', BROWSING_PLATFORMS);
console.log('getBrowsingFilter():', JSON.stringify(getBrowsingFilter()));

console.log('\n=== ALL VENDORS: mentioned:true via countMentions ===');
const counted = await countMentions({});
console.log(`countMentions (browsing-only): ${counted}`);

const raw = await db.collection('ai_mention_scans').countDocuments({ mentioned: true });
console.log(`Raw unfiltered:               ${raw}`);
console.log(`Excluded by filter:           ${raw - counted}`);

console.log('\n=== EXPECTED: counted ≈ 20, raw ≈ 42538 ===');

await mongoose.disconnect();
