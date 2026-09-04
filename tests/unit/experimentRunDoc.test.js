import { describe, it, expect } from 'vitest';
import { experimentRunDoc } from '../../scripts/experiments/lib/experimentRunDoc.js';

const base = {
  study: 'study_2026_09_ai_visibility_content',
  prompt: { id: 'bi-01', text: 'q' },
  modelVersion: 'sonar',
  text: 'an answer',
  citations: ['https://a.com', 'https://tendorai.com/x'],
  targetResults: [],
};
const raw = { id: 'chatcmpl-1', choices: [{ message: { content: 'an answer' } }], citations: base.citations };

// The exact field set the runner wrote before this change.
const ORIGINAL_KEYS = [
  'study', 'wave', 'promptId', 'promptText', 'platform', 'modelVersion',
  'modelParams', 'responseText', 'citedUrls', 'targets', 'status',
].sort();

describe('experimentRunDoc — wave sensitivity of rawResponse (constraint 3)', () => {
  it('wave 1 Perplexity: produces exactly the original field set, rawResponse absent', () => {
    const doc = experimentRunDoc({ ...base, wave: 1, platform: 'perplexity', raw });
    expect(Object.keys(doc).sort()).toEqual(ORIGINAL_KEYS);
    expect('rawResponse' in doc).toBe(false);
    // response payload passed through verbatim
    expect(doc.responseText).toBe('an answer');
    expect(doc.citedUrls).toBe(base.citations);
  });

  it('wave 2 Perplexity: includes rawResponse as the exact object supplied', () => {
    const doc = experimentRunDoc({ ...base, wave: 2, platform: 'perplexity', raw });
    expect('rawResponse' in doc).toBe(true);
    expect(doc.rawResponse).toBe(raw);
  });

  it('wave 2 ChatGPT/Gemini (no raw supplied): rawResponse absent', () => {
    for (const platform of ['chatgpt', 'gemini']) {
      const doc = experimentRunDoc({ ...base, wave: 2, platform, raw: undefined });
      expect('rawResponse' in doc).toBe(false);
      expect(Object.keys(doc).sort()).toEqual(ORIGINAL_KEYS);
    }
  });

  it('wave 3 Perplexity: still includes rawResponse (>= 2)', () => {
    const doc = experimentRunDoc({ ...base, wave: 3, platform: 'perplexity', raw });
    expect(doc.rawResponse).toBe(raw);
  });
});
