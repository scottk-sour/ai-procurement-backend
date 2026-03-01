/**
 * Multi-platform AI query orchestrator.
 * Queries all enabled platforms in parallel and returns results.
 */

import { queryPerplexity } from './perplexity.js';
import { queryChatGPT } from './chatgpt.js';
import { queryClaude } from './claude.js';
import { queryGemini } from './gemini.js';
import { queryGrok } from './grok.js';
import { queryMeta } from './meta.js';

const PLATFORMS = [
  { key: 'perplexity', label: 'Perplexity', fn: queryPerplexity, envKey: 'PERPLEXITY_API_KEY' },
  { key: 'chatgpt',    label: 'ChatGPT',    fn: queryChatGPT,    envKey: 'OPENAI_API_KEY' },
  { key: 'claude',     label: 'Claude',      fn: queryClaude,      envKey: 'ANTHROPIC_API_KEY' },
  { key: 'gemini',     label: 'Gemini',      fn: queryGemini,      envKey: 'GEMINI_API_KEY' },
  { key: 'grok',       label: 'Grok',        fn: queryGrok,        envKey: 'GROK_API_KEY' },
  { key: 'meta',       label: 'Meta AI',     fn: queryMeta,        envKey: 'GROQ_API_KEY' },
];

const PLATFORM_TIMEOUT = 30000; // 30 seconds per platform

/**
 * Run a single platform query with a timeout.
 */
async function queryWithTimeout(platform, params) {
  return Promise.race([
    platform.fn(params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${PLATFORM_TIMEOUT / 1000}s`)), PLATFORM_TIMEOUT)
    ),
  ]);
}

/**
 * Query all enabled AI platforms in parallel.
 * @param {Object} params - { companyName, category, city, categoryLabel }
 * @returns {Promise<Array>} Array of platform result objects
 */
export async function queryAllPlatforms({ companyName, category, city, categoryLabel }) {
  const enabledPlatforms = PLATFORMS.filter(p => process.env[p.envKey]);

  if (enabledPlatforms.length === 0) {
    console.warn('[PlatformQuery] No platform API keys configured');
    return [];
  }

  console.log(`[PlatformQuery] Querying ${enabledPlatforms.length} platforms for "${companyName}" (${categoryLabel}, ${city})`);

  const results = await Promise.allSettled(
    enabledPlatforms.map(platform =>
      queryWithTimeout(platform, { companyName, categoryLabel, city })
        .catch(err => ({
          platform: platform.key,
          platformLabel: platform.label,
          mentioned: false,
          position: null,
          snippet: null,
          competitors: [],
          rawResponse: null,
          error: err.message,
        }))
    )
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Should not reach here due to inner catch, but just in case
    return {
      platform: enabledPlatforms[i].key,
      platformLabel: enabledPlatforms[i].label,
      mentioned: false,
      position: null,
      snippet: null,
      competitors: [],
      rawResponse: null,
      error: result.reason?.message || 'Unknown error',
    };
  });
}
