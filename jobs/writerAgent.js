import cron from 'node-cron';
import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import { runWriterAgentForVendor } from '../services/writerAgent.js';
import { sendEmail } from '../services/emailService.js';
import logger from '../services/logger.js';

const PRO_TIERS = ['pro', 'managed', 'verified', 'enterprise'];
const ADMIN_EMAIL = 'scott.davies@tendorai.com';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runWeeklyWriterAgent() {
  const startTime = Date.now();
  logger.info(`[WriterAgent] Run starting at ${new Date().toISOString()}`);

  let vendors;
  try {
    vendors = await Vendor.find({ tier: { $in: PRO_TIERS } })
      .select('_id company tier vendorType')
      .lean();
  } catch (err) {
    logger.error('[WriterAgent] Failed to query Pro vendors:', err.message);
    return;
  }

  logger.info(`[WriterAgent] Found ${vendors.length} Pro vendors`);

  let draftedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const skipReasons = {};
  const results = [];

  for (const vendor of vendors) {
    try {
      const result = await runWriterAgentForVendor(vendor._id);

      if (result.skipped) {
        skippedCount++;
        skipReasons[result.reason] = (skipReasons[result.reason] || 0) + 1;
        logger.info(`[WriterAgent] ${vendor.company}: skipped — ${result.reason}`);
      } else if (result.blocked) {
        failedCount++;
        logger.warn(`[WriterAgent] ${vendor.company}: blocked — ${result.reason}`);
      } else if (result.success) {
        draftedCount++;
        logger.info(`[WriterAgent] ${vendor.company}: drafted "${result.draftTitle}" ($${result.costEstimateUSD?.toFixed(4)})`);
      } else {
        failedCount++;
        logger.error(`[WriterAgent] ${vendor.company}: failed — ${result.error || 'unknown'}`);
      }

      results.push({ company: vendor.company, vendorId: String(vendor._id), ...result });
    } catch (err) {
      failedCount++;
      logger.error(`[WriterAgent] ${vendor.company}: unexpected error — ${err.message}`);
      logger.error(err.stack);
      results.push({ company: vendor.company, vendorId: String(vendor._id), success: false, error: err.message });

      // Close any stuck "running" AgentRun for this vendor so it doesn't block future runs
      try {
        const stuckRun = await AgentRun.findOne({
          vendorId: vendor._id, agentName: 'writer', status: 'running',
        });
        if (stuckRun) {
          stuckRun.status = 'failed';
          stuckRun.completedAt = new Date();
          stuckRun.failureReason = `Crash recovery: ${err.message}`;
          if (stuckRun.startedAt) stuckRun.durationMs = stuckRun.completedAt.getTime() - stuckRun.startedAt.getTime();
          await stuckRun.save();
          logger.warn(`[WriterAgent] Closed stuck run ${stuckRun._id} for ${vendor.company}`);
        }
      } catch (cleanupErr) {
        logger.error(`[WriterAgent] Failed to close stuck run for ${vendor.company}: ${cleanupErr.message}`);
      }
    }

    if (vendors.indexOf(vendor) < vendors.length - 1) {
      await sleep(5000);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  const summaryLines = [
    `Writer Agent run completed in ${durationSec}s`,
    `Total vendors: ${vendors.length}`,
    `Drafted: ${draftedCount}`,
    `Skipped: ${skippedCount}`,
    ...Object.entries(skipReasons).map(([reason, count]) => `  - ${reason}: ${count}`),
    `Failed: ${failedCount}`,
  ];
  const summaryText = summaryLines.join('\n');

  logger.info(`[WriterAgent] Run complete:\n${summaryText}`);

  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `Writer Agent run: ${draftedCount} drafted, ${skippedCount} skipped, ${failedCount} failed`,
      text: summaryText,
      html: `<pre style="font-family: monospace; font-size: 14px; line-height: 1.6;">${summaryText}</pre>`,
    });
  } catch (err) {
    logger.error(`[WriterAgent] Failed to send summary email: ${err.message}`);
  }
}

export function registerWriterAgentCron() {
  if (process.env.ENABLE_CRON !== 'true') return;

  cron.schedule('0 5 * * 1,3,5', async () => {
    logger.info(`[WriterAgent] Cron trigger: ${new Date().toUTCString()}`);
    try {
      await runWeeklyWriterAgent();
    } catch (err) {
      logger.error('[WriterAgent] Cron run failed:', err.message);
    }
  });

  logger.info('[WriterAgent] Cron registered: Mon/Wed/Fri at 05:00 UTC');
}
