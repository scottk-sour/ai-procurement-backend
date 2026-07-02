import { describe, it, expect } from 'vitest';
import fs from 'fs';

const src = fs.readFileSync('services/writerAgent.js', 'utf8');
const fnBlock = src.match(/function normaliseForMatch[\s\S]*?return sent;\n\}/)?.[0];
if (!fnBlock) throw new Error('Could not extract functions');
const mod = {};
eval(`(function(exports) { ${fnBlock}\n exports.applyRepairs = applyRepairs; exports.locateExcerptInText = locateExcerptInText; })`)(mod);
const { applyRepairs, locateExcerptInText } = mod;

describe('sentence boundary — no mid-word fragments', () => {

  it('deletion does not leave "rking days" fragment', () => {
    const draft = 'We take complaints seriously. We aim to respond within 5 working days you aim to respond. All complaints are logged and tracked. Contact us for details.';

    const issue = {
      sentence: 'We aim to respond within 5 working days.',
      repair: null,
      verdict: 'firm-unverified',
    };

    const { repaired } = applyRepairs(draft, [issue]);
    expect(repaired).not.toContain('rking days');
    expect(repaired).not.toContain('rking');
    expect(repaired).toContain('We take complaints seriously');
    expect(repaired).toContain('Contact us for details');
  });

  it('replacement of a reworded sentence leaves no fragment', () => {
    const draft = 'Our complaints process ensures every issue is addressed. We aim to acknowledge within two working days and resolve within eight weeks. This exceeds the regulatory minimum.';

    const issue = {
      sentence: 'We aim to acknowledge within two working days and resolve within eight weeks.',
      repair: 'We acknowledge complaints within [FIRM_DATA: acknowledgement timeframe] and aim to resolve within [FIRM_DATA: resolution timeframe].',
      verdict: 'contradicted',
    };

    const { repaired, unresolved } = applyRepairs(draft, [issue]);
    expect(unresolved).toHaveLength(0);
    expect(repaired).toContain('[FIRM_DATA: acknowledgement timeframe]');
    expect(repaired).not.toContain('two working days');
    expect(repaired).toContain('Our complaints process ensures every issue is addressed');
    expect(repaired).toContain('This exceeds the regulatory minimum');
  });

  it('locateExcerptInText snaps to full sentence', () => {
    const text = 'First sentence here. The agent must respond within 5 working days to any complaint. Last sentence.';
    const excerpt = 'respond within 5 working days';

    const located = locateExcerptInText(text, excerpt);
    expect(located).not.toBeNull();
    expect(located).toMatch(/^[A-Z]/);
    expect(located).toMatch(/\.$/);
    expect(located).not.toMatch(/^rking/);
  });
});
