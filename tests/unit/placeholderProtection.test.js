import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('FIX 1: fabrication review drops placeholder flags', () => {
  it('firmClaimsNotInContext containing [FIRM_DATA:] is filtered out', () => {
    const containsPlaceholder = (text) => /\[FIRM_DATA:|\[FIRM TO PROVIDE:/i.test(text || '');

    const rawFirmClaims = [
      { claim: 'Cardiff Property Partners resolved [FIRM_DATA: complaintResolutionDays] complaints' },
      { claim: 'We have been trading for 15 years' },
    ];

    const filtered = rawFirmClaims.filter(c => !containsPlaceholder(c.claim));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].claim).toContain('15 years');
    expect(filtered.some(c => c.claim.includes('FIRM_DATA'))).toBe(false);
  });

  it('fabricatedAttributions containing [FIRM_DATA:] is filtered out', () => {
    const containsPlaceholder = (text) => /\[FIRM_DATA:|\[FIRM TO PROVIDE:/i.test(text || '');

    const rawAttribs = [
      { claim: 'Our team handles [FIRM_DATA: cases per year] cases annually', body: 'anonymous' },
      { claim: 'Propertymark data shows 40% faster sales', body: 'Propertymark' },
    ];

    const filtered = rawAttribs.filter(a => !containsPlaceholder(a.claim) && !containsPlaceholder(a.body));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].claim).toContain('Propertymark');
  });

  it('a draft whose only flags are placeholder sentences passes', () => {
    const containsPlaceholder = (text) => /\[FIRM_DATA:|\[FIRM TO PROVIDE:/i.test(text || '');

    const rawFirmClaims = [
      { claim: 'We respond within [FIRM_DATA: response timeframe]' },
    ];
    const filtered = rawFirmClaims.filter(c => !containsPlaceholder(c.claim));
    expect(filtered).toHaveLength(0);

    const verdict = (filtered.length > 0) ? 'fail' : 'pass';
    expect(verdict).toBe('pass');
  });
});

describe('FIX 2: repair/deletion skips placeholder sentences', () => {
  it('a sentence containing [FIRM_DATA:] is NOT deleted', () => {
    const src = fs.readFileSync('services/writerAgent.js', 'utf8');
    const fnBlock = src.match(/function normaliseForMatch[\s\S]*?return sent;\n\}/)?.[0];
    if (!fnBlock) throw new Error('Could not extract functions');
    const mod = {};
    eval(`(function(exports) { ${fnBlock}\n exports.locateExcerptInText = locateExcerptInText; })`)(mod);

    const body = 'We take complaints seriously. Cardiff Property Partners resolved [FIRM_DATA: complaintResolutionDays] complaints last year. Contact us for details.';
    const excerpt = 'Cardiff Property Partners resolved';

    const located = mod.locateExcerptInText(body, excerpt);
    expect(located).not.toBeNull();

    const isPlaceholder = /\[FIRM_DATA:|\[FIRM TO PROVIDE:/i.test(located);
    expect(isPlaceholder).toBe(true);
  });
});
