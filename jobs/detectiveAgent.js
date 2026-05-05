import cron from 'node-cron';
import { runWeeklyDetective } from '../services/detectiveAgent.js';
import logger from '../services/logger.js';

export function registerDetectiveAgentCron() {
  if (process.env.ENABLE_CRON !== 'true') return;

  cron.schedule('30 5 * * 1', async () => {
    logger.info('[Detective] Cron trigger: Monday 05:30 UTC');
    try {
      await runWeeklyDetective();
    } catch (err) {
      logger.error('[Detective] Weekly run failed:', err.message);
    }
  });

  logger.info('[Detective] Cron registered: every Monday at 05:30 UTC');
}
