import mongoose from 'mongoose';
import { runWriterAgentForVendor } from '../services/writerAgent.js';
import AgentRun from '../models/AgentRun.js';
import ApprovalQueue from '../models/ApprovalQueue.js';

const HARRISON_ID = '697e212e7df418c53adbfafc';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  console.log('=== TRIGGERING DRY-RUN FOR HARRISON & CO ===');
  console.log('Vendor ID:', HARRISON_ID);
  console.log('Dry run: true');
  console.log('Expected duration: 30-60 seconds (real Anthropic API call)');
  console.log('Expected cost: ~$0.05\n');

  const startTime = Date.now();
  const result = await runWriterAgentForVendor(HARRISON_ID, { dryRun: true });
  const elapsedMs = Date.now() - startTime;

  console.log('=== RESULT FROM runWriterAgentForVendor ===');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nElapsed: ${elapsedMs}ms\n`);

  if (result.skipped) {
    console.log('Run was skipped. Reason:', result.reason);
    await mongoose.disconnect();
    return;
  }

  if (!result.success) {
    console.log('Run failed:', result.error);
    await mongoose.disconnect();
    return;
  }

  // Fetch the AgentRun document
  if (result.agentRunId) {
    const run = await AgentRun.findById(result.agentRunId).lean();
    console.log('=== AGENTRUN DOCUMENT ===');
    console.log('Status:', run.status);
    console.log('Summary:', run.summary);
    console.log('Duration:', run.durationMs, 'ms');
    console.log('\nArtifacts:');
    console.log(JSON.stringify(run.artifacts, null, 2));
    console.log('\nMetricsAfter:');
    console.log(JSON.stringify(run.metricsAfter, null, 2));
  }

  // Fetch the Approval document if it was created
  if (result.approvalId) {
    console.log('\n=== APPROVAL DOCUMENT ===');
    const approval = await ApprovalQueue.findById(result.approvalId).lean();
    console.log('Title:', approval.title);
    console.log('Status:', approval.status);
    console.log('Item type:', approval.itemType);
    console.log('\nMetadata:');
    console.log(JSON.stringify(approval.metadata, null, 2));
    console.log('\n=== DRAFT PAYLOAD ===');
    console.log('Title:', approval.draftPayload?.title);
    console.log('Pillar:', approval.draftPayload?.pillar);
    console.log('Topic:', approval.draftPayload?.topic);
    console.log('Tags:', approval.draftPayload?.tags);
    console.log('placeholderCount (verified):', approval.draftPayload?.placeholderCount);
    console.log('topicSuitabilityFlag:', approval.draftPayload?.topicSuitabilityFlag);
    console.log('\n--- BODY (first 1500 chars) ---');
    console.log((approval.draftPayload?.body || '').slice(0, 1500));
    console.log('\n--- BODY (last 1000 chars) ---');
    const body = approval.draftPayload?.body || '';
    console.log(body.length > 1500 ? body.slice(-1000) : '(body shorter than 1500 chars; not duplicating)');
    console.log('\n--- LINKEDIN TEXT ---');
    console.log(approval.draftPayload?.linkedInText || '(empty)');
    console.log('\n--- FACEBOOK TEXT ---');
    console.log(approval.draftPayload?.facebookText || '(empty)');
    console.log('\n--- BODY LENGTH ---');
    console.log('Total chars:', body.length);
    console.log('Total [FIRM TO PROVIDE] markers (manual count):',
      (body.match(/\[FIRM TO PROVIDE/gi) || []).length +
      ((approval.draftPayload?.linkedInText || '').match(/\[FIRM TO PROVIDE/gi) || []).length +
      ((approval.draftPayload?.facebookText || '').match(/\[FIRM TO PROVIDE/gi) || []).length
    );
  }

  await mongoose.disconnect();
  console.log('\n=== DRY-RUN COMPLETE ===');
}

main().catch(err => {
  console.error('DRY-RUN ERROR:', err);
  process.exit(1);
});
