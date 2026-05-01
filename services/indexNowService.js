import logger from './logger.js';

/**
 * Ping Bing IndexNow to request immediate crawling of one or more URLs.
 * Requires INDEXNOW_KEY env var. Skips silently if not configured.
 * Never throws — always returns { ok, error? }.
 */
export async function pingBingIndexNow(urls) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    logger.warn('[IndexNow] INDEXNOW_KEY not configured — skipping ping');
    return { ok: false, error: 'INDEXNOW_KEY not configured' };
  }

  if (!urls || !urls.length) {
    return { ok: false, error: 'No URLs provided' };
  }

  const payload = {
    host: 'tendorai.com',
    key,
    keyLocation: `https://tendorai.com/${key}.txt`,
    urlList: urls,
  };

  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok || response.status === 202) {
      logger.info(`[IndexNow] Pinged ${urls.length} URL(s) — status ${response.status}`);
      return { ok: true };
    }

    const body = await response.text().catch(() => '');
    logger.error(`[IndexNow] Ping failed — status ${response.status}: ${body}`);
    return { ok: false, error: `HTTP ${response.status}: ${body}` };
  } catch (err) {
    logger.error(`[IndexNow] Ping error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}
