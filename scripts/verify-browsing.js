// One-off check: does each platform ACTUALLY browse before answering?
// Run AFTER editing the readers, BEFORE adding anything to BROWSING_PLATFORMS.
// Usage (on Render shell, where API keys are present): node scripts/verify-browsing.js
import 'dotenv/config';
import { queryPerplexity } from '../services/platformQuery/perplexity.js';
import { queryChatGPT } from '../services/platformQuery/chatgpt.js';
import { queryGemini } from '../services/platformQuery/gemini.js';

const params = {
  companyName: 'Forbes Solicitors',
  categoryLabel: 'conveyancing solicitor',
  city: 'Manchester',
  websiteUrl: null,
};

const checks = [
  ['perplexity', queryPerplexity], // reference: already trusted/browsing
  ['chatgpt', queryChatGPT],
  ['gemini', queryGemini],
];

for (const [name, fn] of checks) {
  try {
    const r = await fn(params);
    console.log(
      `${name.padEnd(12)} browsed=${r.browsed ?? '(reference)'}  ` +
      `citations=${r.citations?.length ?? 0}  mentioned=${r.mentioned}`
    );
  } catch (e) {
    console.log(`${name.padEnd(12)} ERROR: ${e.message}`);
  }
}
process.exit(0);
