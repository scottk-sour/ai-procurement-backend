import { describe, it, expect } from 'vitest';
import { BROWSING_PLATFORMS } from '../../lib/config/browsingPlatforms.js';

describe('browsing allowlist', () => {
  it('excludes all non-browsing platforms', () => {
    for (const banned of ['claude', 'grok', 'meta']) {
      expect(BROWSING_PLATFORMS).not.toContain(banned);
    }
  });
  it('keeps perplexity', () => {
    expect(BROWSING_PLATFORMS).toContain('perplexity');
  });
});
