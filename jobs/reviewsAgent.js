import cron from 'node-cron';
import { runWeeklyReviewsBatch } from '../services/reviewsAgent.js';
import logger from '../services/logger.js';

export function registerReviewsAgentCron() {
  if (process.env.ENABLE_CRON !== 'true') return;

  cron.schedule('15 6 * * 1', async () => {
    logger.info('[Reviews] Cron trigger: Monday 06:15 UTC');
    try {
      await runWeeklyReviewsBatch();
    } catch (err) {
      logger.error('[Reviews] Weekly batch failed:', err.message);
    }
  });

  logger.info('[Reviews] Cron registered: every Monday at 06:15 UTC');
}
