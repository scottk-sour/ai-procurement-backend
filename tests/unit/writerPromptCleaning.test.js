import { describe, it, expect } from 'vitest';

// Test the prompt-cleaning regex from writerAgent.js directly (same logic,
// extracted to avoid deep import chain of vendorPostRoutes → express → mongoose)

function cleanPrompt(raw) {
  return raw
    .replace(/Primary data hook[^\n]*\{[NXa-z]+\}[^\n]*/gi, '')
    .replace(/\{N\}/g, '[number]')
    .replace(/\{X\}/g, '[amount]')
    .replace(/\{[a-z_-]+\}/gi, '[detail]');
}

describe('Writer prompt cleaning', () => {
  it('strips primaryDataHook lines containing unfilled {N} and {X} templates', () => {
    const input = 'Some context.\nPrimary data hook — prompt the reader with a template: "Based on our last {N} transactions, cost is £{X}."\nMore context.';
    const cleaned = cleanPrompt(input);
    expect(cleaned).not.toContain('{N}');
    expect(cleaned).not.toContain('{X}');
    expect(cleaned).not.toContain('Primary data hook');
    expect(cleaned).toContain('Some context');
    expect(cleaned).toContain('More context');
  });

  it('replaces remaining {specialism} tokens with [detail]', () => {
    const input = 'Write about {specialism} in {city}.';
    const cleaned = cleanPrompt(input);
    expect(cleaned).toBe('Write about [detail] in [detail].');
  });

  it('does not strip lines without unfilled templates', () => {
    const input = 'The firm provided this data: "We completed 247 transactions last year."';
    const cleaned = cleanPrompt(input);
    expect(cleaned).toBe(input);
  });

  it('replaces {N} in non-hook context with [number]', () => {
    const input = 'For {N} clients last year, fixed fees saved £{X}.';
    const cleaned = cleanPrompt(input);
    expect(cleaned).toBe('For [number] clients last year, fixed fees saved £[amount].');
  });
});
