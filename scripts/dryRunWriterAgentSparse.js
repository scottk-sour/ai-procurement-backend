import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import { runWriterAgentForVendor } from '../services/writerAgent.js';
import AgentRun from '../models/AgentRun.js';
import ApprovalQueue from '../models/ApprovalQueue.js';

const ADAMS_HARRISON_ID = '6994b07424f0b3a510482130';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  // Save current tier so we can restore it
  const before = await Vendor.findById(ADAMS_HARRISON_ID).select('tier subscriptionStatus').lean();
  console.log('=== Vendor state BEFORE test ===');
  console.log('  tier:', before.tier);
  console.log('  subscriptionStatus:', before.subscriptionStatus);

  console.log('\n=== Temporarily promoting Adams Harrison to pro tier for test ===');
  await Vendor.updateOne(
    { _id: ADAMS_HARRISON_ID },
    { $set: { tier: 'pro', subscriptionStatus: 'active' } }
  );
  console.log('Promoted.');

  // Reset any existing writer AgentRun for this week
  const weekStart = AgentRun.normaliseWeekStarting(new Date());
  const existingRun = await AgentRun.findOne({
    vendorId: ADAMS_HARRISON_ID,
    agentName: 'writer',
    weekStarting: weekStart,
  });
  if (existingRun) {
    console.log('Found existing AgentRun, deleting:', existingRun._id.toString());
    await AgentRun.deleteOne({ _id: existingRun._id });
  } else {
    console.log('No existing AgentRun for this week.');
  }

  let result;
  try {
    console.log('\n=== TRIGGERING DRY-RUN ===');
    console.log('Vendor: Adams Harrison (Saffron Walden)');
    console.log('Vendor ID:', ADAMS_HARRISON_ID);
    console.log('Dry run: true');
    console.log('Expected duration: 30-60 seconds\n');

    const startTime = Date.now();
    result = await runWriterAgentForVendor(ADAMS_HARRISON_ID, { dryRun: true });
    const elapsedMs = Date.now() - startTime;

    console.log('=== RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nElapsed: ${elapsedMs}ms\n`);
  } catch (err) {
    console.error('Run threw:', err);
  } finally {
    // ALWAYS revert tier even if the run threw
    console.log('\n=== Reverting Adams Harrison tier ===');
    await Vendor.updateOne(
      { _id: ADAMS_HARRISON_ID },
      { $set: { tier: before.tier, subscriptionStatus: before.subscriptionStatus } }
    );
    const after = await Vendor.findById(ADAMS_HARRISON_ID).select('tier subscriptionStatus').lean();
    console.log('Reverted to:');
    console.log('  tier:', after.tier);
    console.log('  subscriptionStatus:', after.subscriptionStatus);
  }

  if (!result || result.skipped || !result.success) {
    console.log('\nNo successful run to inspect.');
    await mongoose.disconnect();
    return;
  }

  // Inspect AgentRun
  if (result.agentRunId) {
    const run = await AgentRun.findById(result.agentRunId).lean();
    console.log('\n=== AGENTRUN ARTIFACTS ===');
    console.log(JSON.stringify(run.artifacts, null, 2));
  }

  // Inspect Approval (or note if it was skipped)
  if (result.approvalId) {
    const approval = await ApprovalQueue.findById(result.approvalId).lean();
    console.log('\n=== APPROVAL ===');
    console.log('Title:', approval.title);
    console.log('placeholderCount:', approval.metadata?.placeholderCount);
    console.log('agentReportedPlaceholderCount:', approval.metadata?.agentReportedPlaceholderCount);
    console.log('topicSuitabilityFlag:', approval.metadata?.topicSuitabilityFlag);

    const body = approval.draftPayload?.body || '';
    console.log('\n--- BODY (full) ---');
    console.log(body);
    console.log('\n--- LINKEDIN ---');
    console.log(approval.draftPayload?.linkedInText || '(empty)');
    console.log('\n--- FACEBOOK ---');
    console.log(approval.draftPayload?.facebookText || '(empty)');

    const placeholderMatches = body.match(/\[FIRM TO PROVIDE[^\]]*\]/gi) || [];
    console.log('\n--- PLACEHOLDER LIST (manual extraction) ---');
    console.log(`Count in body: ${placeholderMatches.length}`);
    placeholderMatches.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  } else {
    console.log('\nNo approval was created (likely topicSuitabilityFlag = unsuitable).');
  }

  await mongoose.disconnect();
  console.log('\n=== TEST COMPLETE ===');
}

main().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
