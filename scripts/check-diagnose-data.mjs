import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

await mongoose.connect(uri);
const db = mongoose.connection.db;

console.log('=== DISTINCT aiModel values ===');
const distinctModels = await db.collection('ai_mention_scans').distinct('aiModel');
console.log(distinctModels);

console.log('\n=== Scan count by aiModel ===');
const modelCounts = await db.collection('ai_mention_scans').aggregate([
  { $group: { _id: '$aiModel', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]).toArray();
for (const r of modelCounts) console.log(`  ${String(r._id).padEnd(25)} ${r.count}`);

console.log('\n=== mentioned:true count by aiModel ===');
const mentionedByModel = await db.collection('ai_mention_scans').aggregate([
  { $match: { mentioned: true } },
  { $group: { _id: '$aiModel', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]).toArray();
for (const r of mentionedByModel) console.log(`  ${String(r._id).padEnd(25)} ${r.count}`);

console.log('\n=== Vendor tier distribution ===');
const tierCounts = await db.collection('vendors').aggregate([
  { $group: { _id: '$tier', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]).toArray();
for (const r of tierCounts) console.log(`  ${String(r._id).padEnd(25)} ${r.count}`);

await mongoose.disconnect();
