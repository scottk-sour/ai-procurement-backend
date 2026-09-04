import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

// Obtain a RECORDED response object from the INSTALLED openai SDK, through the
// Perplexity-configured client, by driving its real response-construction path
// with a stubbed transport (no live key/network; only the wire bytes are
// simulated — the object the SDK hands back is the real one). Then assign it
// DIRECTLY to ExperimentRun.rawResponse and read it back — no serialisation step
// in between.
async function recordedSdkResponse() {
  const wireBody = {
    id: 'chatcmpl-probe', object: 'chat.completion', created: 1725460000, model: 'sonar',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Firms should do X [1].' }, logprobs: null }],
    citations: ['https://tendorai.com/blog/ai-visibility', 'https://greggking.co.uk/x'],
    usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
  };
  const fakeFetch = async () => new Response(JSON.stringify(wireBody), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = new OpenAI({ apiKey: 'test-dummy', baseURL: 'https://api.perplexity.ai', fetch: fakeFetch });
  return client.chat.completions.create({ model: 'sonar', messages: [{ role: 'user', content: 'q' }], max_tokens: 1024 });
}

describe('rawResponse — direct assignment to the Mixed field, no conversion', () => {
  it('assigns a recorded SDK response and reads it back equal', async () => {
    const resp = await recordedSdkResponse();

    const doc = new ExperimentRun({
      study: 'study_2026_09_ai_visibility_content', wave: 2, promptId: 'bi-01', promptText: 'q',
      platform: 'perplexity', modelVersion: 'sonar', responseText: resp.choices[0].message.content,
      citedUrls: resp.citations, targets: [], status: 'ok',
      rawResponse: resp, // <- assigned directly, no stringify/transform
    });

    expect(doc.validateSync()).toBeUndefined();
    const back = doc.toObject().rawResponse;
    expect(JSON.stringify(back)).toBe(JSON.stringify(resp));

    // BSON round-trip (as Mongoose persists) is lossless.
    const BSON = mongoose.mongo.BSON;
    const round = BSON.deserialize(BSON.serialize({ rawResponse: resp })).rawResponse;
    expect(JSON.stringify(round)).toBe(JSON.stringify(resp));
  });
});
