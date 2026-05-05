import cron from 'node-cron';
import { runWeeklyListingsCheck } from '../services/listingsAgent.js';
import logger from '../services/logger.js';

export function registerListingsAgentCron() {
  if (process.env.ENABLE_CRON !== 'true') return;

  cron.schedule('45 5 * * 1', async () => {
    logger.info('[Listings] Cron trigger: Monday 05:45 UTC');
    try {
      await runWeeklyListingsCheck();
    } catch (err) {
      logger.error('[Listings] Weekly check failed:', err.message);
    }
  });

  logger.info('[Listings] Cron registered: every Monday at 05:45 UTC');
}
