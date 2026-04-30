import mongoose from 'mongoose';
import AgentRun from '../models/AgentRun.js';

const HARRISON_ID = '697e212e7df418c53adbfafc';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  // Find this week's writer AgentRun for Harrison
  const weekStart = AgentRun.normaliseWeekStarting(new Date());
  console.log('Looking for writer AgentRun for week starting:', weekStart.toISOString());

  const existing = await AgentRun.findOne({
    vendorId: HARRISON_ID,
    agentName: 'writer',
    weekStarting: weekStart,
  });

  if (!existing) {
    console.log('No existing writer AgentRun found for this week. Nothing to reset.');
    await mongoose.disconnect();
    return;
  }

  console.log('Found existing run:');
  console.log('  _id:', existing._id.toString());
  console.log('  status:', existing.status);
  console.log('  summary:', existing.summary);
  console.log('  createdAt:', existing.createdAt);
  console.log('  artifacts.draftTitle:', existing.artifacts?.draftTitle);

  // Delete it cleanly — this is a test environment cleanup
  await AgentRun.deleteOne({ _id: existing._id });
  console.log('\nDeleted. Harrison can now be re-run via dryRunWriterAgent.');

  await mongoose.disconnect();
  console.log('Disconnected.');
}

main().catch(err => {
  console.error('RESET ERROR:', err);
  process.exit(1);
});
