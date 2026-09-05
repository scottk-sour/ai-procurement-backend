import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

await mongoose.connect(uri);
const db = mongoose.connection.db;

const { BROWSING_PLATFORMS } = await import('../lib/config/browsingPlatforms.js');
const { calculateVisibilityScore } = await import('../utils/visibilityScore.js');

console.log('========================================');
console.log('1. FILTER CHECK');
console.log('========================================');
console.log('BROWSING_PLATFORMS:', BROWSING_PLATFORMS);

const countedMentions = await db.collection('ai_mention_scans').countDocuments({
  mentioned: true,
  aiModel: { $in: BROWSING_PLATFORMS },
});
const excludedMentions = await db.collection('ai_mention_scans').countDocuments({
  mentioned: true,
  aiModel: { $nin: BROWSING_PLATFORMS },
});
console.log(`Counted (in BROWSING_PLATFORMS):  ${countedMentions}`);
console.log(`Excluded (not in BROWSING_PLATFORMS): ${excludedMentions}`);

console.log('\n========================================');
console.log('2. PRO VENDOR CEILING');
console.log('========================================');

const proVendor = await db.collection('vendors').findOne({ tier: 'pro' });
if (!proVendor) {
  console.log('No vendor with tier "pro" found');
} else {
  console.log(`Vendor: ${proVendor.company} (tier: ${proVendor.tier})`);

  const vendorId = proVendor._id;
  const vendorObjId = new mongoose.Types.ObjectId(vendorId);

  const products = await db.collection('vendorproducts').find({
    $or: [{ vendorId }, { vendorId: vendorId.toString() }],
  }).toArray();

  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const [mentionsThisWeek, mentionsLastWeek, totalMentions30d] = await Promise.all([
    db.collection('ai_mention_scans').countDocuments({
      vendorId, mentioned: true, aiModel: { $in: BROWSING_PLATFORMS },
      scanDate: { $gte: thisWeekStart },
    }),
    db.collection('ai_mention_scans').countDocuments({
      vendorId, mentioned: true, aiModel: { $in: BROWSING_PLATFORMS },
      scanDate: { $gte: lastWeekStart, $lt: thisWeekStart },
    }),
    db.collection('ai_mention_scans').countDocuments({
      vendorId, mentioned: true, aiModel: { $in: BROWSING_PLATFORMS },
      scanDate: { $gte: thirtyDaysAgo },
    }),
  ]);

  const positionAgg = await db.collection('ai_mention_scans').aggregate([
    { $match: { vendorId: vendorObjId, mentioned: true, aiModel: { $in: BROWSING_PLATFORMS }, scanDate: { $gte: thirtyDaysAgo } } },
    { $group: { _id: null, positions: { $push: '$position' } } },
  ]).toArray();

  let avgPosition = null;
  if (positionAgg.length > 0) {
    const positions = positionAgg[0].positions;
    const firstCount = positions.filter(p => p === 'first').length;
    const top3Count = positions.filter(p => p === 'top3').length;
    if (firstCount > positions.length / 2) avgPosition = 'first';
    else if ((firstCount + top3Count) > positions.length / 2) avgPosition = 'top3';
    else avgPosition = 'mentioned';
  }

  const mentionData = { mentionsThisWeek, mentionsLastWeek, totalMentions30d, avgPosition };

  const reviewAgg = await db.collection('reviews').aggregate([
    { $match: { vendor: vendorObjId, status: 'approved' } },
    { $group: { _id: null, reviewCount: { $sum: 1 }, averageRating: { $avg: '$rating' } } },
  ]).toArray();
  const reviewData = reviewAgg[0] || { reviewCount: 0, averageRating: 0 };

  const scoreData = calculateVisibilityScore(proVendor, products, mentionData, reviewData, {}, {});

  console.log(`scoreData.tier:               ${scoreData.tier}`);
  console.log(`scoreData.maxPossibleForTier:  ${scoreData.maxPossibleForTier}`);
  console.log(`scoreData.score:              ${scoreData.score}`);

  console.log('\n========================================');
  console.log('3. SANITY — mention points breakdown');
  console.log('========================================');
  console.log(`mentionData:`, JSON.stringify(mentionData));
  console.log(`mentions.earned:              ${scoreData.breakdown.mentions.earned} / ${scoreData.breakdown.mentions.max}`);
  console.log(`mentions.items:`);
  for (const item of scoreData.breakdown.mentions.items) {
    console.log(`  ${item.completed ? '✓' : '✗'} ${item.name} (${item.points} pts)`);
  }

  console.log('\nFull breakdown:');
  for (const [key, cat] of Object.entries(scoreData.breakdown)) {
    console.log(`  ${cat.label.padEnd(25)} ${cat.earned}/${cat.max}`);
  }
}

await mongoose.disconnect();
