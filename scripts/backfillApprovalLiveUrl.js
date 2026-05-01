import mongoose from 'mongoose';
import ApprovalQueue from '../models/ApprovalQueue.js';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  const items = await ApprovalQueue.find({
    itemType: 'content_draft',
    status: 'executed',
    liveUrl: { $in: [null, undefined, ''] },
    'executionResult.slug': { $exists: true },
  });

  console.log(`Found ${items.length} executed content_draft items without liveUrl.\n`);

  let updated = 0;
  for (const item of items) {
    const slug = item.executionResult?.slug;
    if (!slug) continue;

    item.liveUrl = `https://tendorai.com/resources/${slug}`;
    await item.save();
    console.log(`  Updated ${item._id}: ${item.liveUrl}`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated} of ${items.length} items.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('BACKFILL ERROR:', err);
  process.exit(1);
});
