import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

await mongoose.connect(uri);
const db = mongoose.connection.db;

const runs = await db.collection('agentruns').find({ agentName: 'writer' })
  .sort({ createdAt: -1 })
  .limit(20)
  .project({ vendorId: 1, status: 1, summary: 1, failureReason: 1, 'artifacts.blockedReason': 1, 'artifacts.fabricationFlags': 1, 'artifacts.gateViolations': 1, 'artifacts.skippedReason': 1, 'artifacts.fabricationReview': 1, 'artifacts.firstPassViolations': 1, createdAt: 1 })
  .toArray();

console.log(`Found ${runs.length} Writer runs total\n`);

const vendors = await db.collection('vendors').find(
  { _id: { $in: runs.map(r => r.vendorId) } },
  { projection: { company: 1, vendorType: 1 } }
).toArray();
const vendorMap = Object.fromEntries(vendors.map(v => [v._id.toString(), v]));

const reasons = {};

for (const run of runs) {
  const v = vendorMap[run.vendorId?.toString()] || {};
  const label = `${v.company || 'Unknown'} (${v.vendorType || '?'})`;
  const date = run.createdAt?.toISOString?.()?.substring(0, 10) || '?';

  let reason;
  if (run.status === 'completed' && run.artifacts?.blockedReason) {
    reason = run.artifacts.blockedReason;
  } else if (run.status === 'failed' && run.failureReason) {
    reason = run.failureReason;
  } else if (run.status === 'completed' && run.summary?.includes('BLOCKED')) {
    reason = run.summary.match(/BLOCKED.*?(?::|—)\s*(.+)/)?.[1] || 'BLOCKED (unstructured)';
  } else if (run.status === 'completed' && run.summary?.includes('AUTO-REJECTED')) {
    reason = 'auto_gate: ' + (run.artifacts?.gateViolations?.map(v => v.code).join(', ') || 'unknown');
  } else if (run.status === 'completed' && !run.artifacts?.blockedReason) {
    reason = '_SUCCESS_';
  } else {
    reason = run.status || 'unknown';
  }

  let detail = '';
  if (run.artifacts?.fabricationFlags?.length) {
    detail = run.artifacts.fabricationFlags.map(f => `${f.body}: "${(f.excerpt || '').substring(0, 80)}"`).join('; ');
  }
  if (run.artifacts?.gateViolations?.length) {
    detail = run.artifacts.gateViolations.map(v => `${v.code}: ${v.message?.substring(0, 80)}`).join('; ');
  }
  if (run.artifacts?.firstPassViolations?.length) {
    detail = run.artifacts.firstPassViolations.slice(0, 3).join('; ');
  }

  console.log(`${date} | ${run.status.padEnd(10)} | ${label.padEnd(40)} | ${reason}`);
  if (detail) console.log(`         detail: ${detail}`);

  if (reason !== '_SUCCESS_') {
    reasons[reason] = (reasons[reason] || 0) + 1;
  }
}

console.log('\n=== FAILURE REASONS RANKED ===');
const sorted = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
if (sorted.length === 0) console.log('  (all runs succeeded or no failures found)');
for (const [reason, count] of sorted) {
  console.log(`  ${count}x  ${reason}`);
}

await mongoose.disconnect();
