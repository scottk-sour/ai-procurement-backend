import { describe, it, expect } from 'vitest';
import { calculateVisibilityScore } from '../../utils/visibilityScore.js';
import { BROWSING_PLATFORMS } from '../../lib/config/browsingPlatforms.js';

describe('visibilityScore — tier mapping', () => {

  it('tier "pro" maps to verified (ceiling 100)', () => {
    const vendor = { tier: 'pro', company: 'Test Ltd', email: 'a@b.com' };
    const result = calculateVisibilityScore(vendor);
    expect(result.tier).toBe('verified');
    expect(result.maxPossibleForTier).toBe(100);
  });

  it('tier "free" maps to listed (ceiling 40)', () => {
    const vendor = { tier: 'free', company: 'Test Ltd', email: 'a@b.com' };
    const result = calculateVisibilityScore(vendor);
    expect(result.tier).toBe('listed');
    expect(result.maxPossibleForTier).toBe(40);
  });

  it('unknown tier falls back to listed safely', () => {
    const vendor = { tier: 'banana', company: 'Test Ltd', email: 'a@b.com' };
    const result = calculateVisibilityScore(vendor);
    expect(result.tier).toBe('listed');
    expect(result.maxPossibleForTier).toBe(40);
  });

  it('tier "managed" maps to verified', () => {
    const vendor = { tier: 'managed', company: 'Test Ltd', email: 'a@b.com' };
    const result = calculateVisibilityScore(vendor);
    expect(result.tier).toBe('verified');
  });

  it('missing tier defaults to listed', () => {
    const vendor = { company: 'Test Ltd', email: 'a@b.com' };
    const result = calculateVisibilityScore(vendor);
    expect(result.tier).toBe('listed');
  });
});

describe('BROWSING_PLATFORMS allowlist', () => {

  it('includes perplexity', () => {
    expect(BROWSING_PLATFORMS).toContain('perplexity');
  });

  it('excludes claude (non-browsing)', () => {
    expect(BROWSING_PLATFORMS).not.toContain('claude');
  });

  it('excludes claude-haiku (non-browsing)', () => {
    expect(BROWSING_PLATFORMS).not.toContain('claude-haiku');
  });

  it('excludes chatgpt (non-browsing, no web_search tool)', () => {
    expect(BROWSING_PLATFORMS).not.toContain('chatgpt');
  });

  it('excludes meta (Groq, no browsing capability)', () => {
    expect(BROWSING_PLATFORMS).not.toContain('meta');
  });
});
