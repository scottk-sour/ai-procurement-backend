/**
 * Regression tests for the AEO free-report mention + competitor pipeline.
 *
 * The live bug (Celtic Frozen Drinks, Pontyclun): Perplexity returned the
 * searched firm in its recommended list, but the report claimed "Mentioned by
 * 0 of 5 platforms" AND listed the firm as its own #1 competitor. Root cause
 * was a strict case-sensitive-with-suffix substring check that failed when
 * the firm's stored name and the AI-output name differed by suffix (Ltd,
 * Limited, etc.) or punctuation.
 *
 * These tests exercise the fixed pipeline end-to-end at the parser boundary:
 *   - A firm appearing in a platform's recommended list must register as
 *     mentioned (regardless of suffix variation / URL-only citation).
 *   - A firm must never appear in its own competitor list.
 */

import { describe, it, expect } from 'vitest';
import { parsePlatformResponse } from '../../services/platformQuery/prompt.js';
import {
  normalizeCompanyName,
  isCompanyMentioned,
  isSameFirm,
  extractDomainTokens,
  isSameDomain,
} from '../../services/platformQuery/nameMatch.js';

describe('normalizeCompanyName', () => {
  it('strips common UK company suffixes', () => {
    expect(normalizeCompanyName('Celtic Frozen Drinks Ltd')).toBe('celtic frozen drinks');
    expect(normalizeCompanyName('Celtic Frozen Drinks Limited')).toBe('celtic frozen drinks');
    expect(normalizeCompanyName('Nutrivend Group')).toBe('nutrivend');
    expect(normalizeCompanyName('Smith & Co')).toBe('smith');
    expect(normalizeCompanyName('Smith LLP')).toBe('smith');
  });

  it('is case and diacritic insensitive', () => {
    expect(normalizeCompanyName('CELTIC FROZEN DRINKS')).toBe('celtic frozen drinks');
    expect(normalizeCompanyName('Café Müller')).toBe('cafe muller');
  });

  it('returns the same token for equivalent suffix variants', () => {
    const a = normalizeCompanyName('Celtic Frozen Drinks');
    const b = normalizeCompanyName('Celtic Frozen Drinks Ltd');
    const c = normalizeCompanyName('celtic frozen drinks limited');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('tolerates empty/missing input', () => {
    expect(normalizeCompanyName('')).toBe('');
    expect(normalizeCompanyName(null)).toBe('');
    expect(normalizeCompanyName(undefined)).toBe('');
  });
});

describe('isSameFirm', () => {
  it('matches suffix-only differences in either direction', () => {
    expect(isSameFirm('Celtic Frozen Drinks', 'Celtic Frozen Drinks Ltd')).toBe(true);
    expect(isSameFirm('Celtic Frozen Drinks Ltd', 'Celtic Frozen Drinks')).toBe(true);
  });

  it('matches different case', () => {
    expect(isSameFirm('celtic frozen drinks', 'Celtic Frozen Drinks')).toBe(true);
  });

  it('does not match unrelated firms sharing a word', () => {
    expect(isSameFirm('Smith Solicitors', 'Smith & Jones Solicitors')).toBe(false);
    expect(isSameFirm('The Nutrivend Group Limited', 'Celtic Frozen Drinks')).toBe(false);
  });
});

describe('extractDomainTokens / isSameDomain', () => {
  it('extracts registrable tokens from URLs', () => {
    const tokens = extractDomainTokens('https://www.celticfrozendrinks.co.uk/about');
    expect(tokens).toContain('celticfrozendrinks.co.uk');
  });

  it('handles bare hostnames', () => {
    const tokens = extractDomainTokens('celticfrozendrinks.co.uk');
    expect(tokens).toContain('celticfrozendrinks.co.uk');
  });

  it('compares two URLs to the same domain', () => {
    expect(
      isSameDomain(
        'https://www.celticfrozendrinks.co.uk',
        'http://celticfrozendrinks.co.uk/contact',
      ),
    ).toBe(true);
    expect(
      isSameDomain('https://nutrivend.com', 'https://celticfrozendrinks.co.uk'),
    ).toBe(false);
  });
});

describe('isCompanyMentioned', () => {
  it('detects the firm when listed with suffix variation', () => {
    const text =
      'Recommended instead: Sun Magic Juices, Nutrivend, The Nutrivend Group Limited, Celtic Frozen Drinks';
    expect(isCompanyMentioned(text, 'Celtic Frozen Drinks Ltd')).toBe(true);
    expect(isCompanyMentioned(text, 'Celtic Frozen Drinks')).toBe(true);
  });

  it('detects the firm via URL citation alone', () => {
    const text = 'See [1] https://celticfrozendrinks.co.uk for supplier details.';
    expect(
      isCompanyMentioned(text, 'Celtic Frozen Drinks Ltd', 'https://celticfrozendrinks.co.uk'),
    ).toBe(true);
  });

  it('returns false when the firm is absent', () => {
    const text = 'Try Sun Magic Juices and Nutrivend for soft-drink supply.';
    expect(isCompanyMentioned(text, 'Celtic Frozen Drinks Ltd')).toBe(false);
  });
});

describe('parsePlatformResponse — Issue 1 regression (mention detection)', () => {
  it('marks the firm as mentioned when listed alongside competitors with suffix variation', () => {
    const perplexityResponse = `Here are the frozen drinks suppliers in Pontyclun, UK:

1. Sun Magic Juices - a specialist soft drinks producer
2. Nutrivend - vending and drinks machines
3. The Nutrivend Group Limited - vending group
4. Celtic Frozen Drinks - local frozen drinks supplier
5. Slush Puppie - frozen drinks brand
`;
    const parsed = parsePlatformResponse(perplexityResponse, 'Celtic Frozen Drinks Ltd');
    expect(parsed.mentioned).toBe(true);
    expect(parsed.position).toBe(4);
  });

  it('marks the firm as mentioned via URL citation alone (Perplexity inline source)', () => {
    const response = `Here are some recommended suppliers:

1. Sun Magic Juices - longstanding juice brand
2. Nutrivend - vending specialist

Source [1] https://celticfrozendrinks.co.uk/about`;
    const parsed = parsePlatformResponse(response, 'Celtic Frozen Drinks Ltd', {
      websiteUrl: 'https://celticfrozendrinks.co.uk',
    });
    expect(parsed.mentioned).toBe(true);
  });

  it('still returns mentioned: false when the firm is genuinely absent', () => {
    const response = `1. Sun Magic Juices - longstanding juice brand
2. Nutrivend - vending specialist
3. Slush Puppie - frozen drinks brand`;
    const parsed = parsePlatformResponse(response, 'Celtic Frozen Drinks Ltd');
    expect(parsed.mentioned).toBe(false);
  });

  it('does not report a mention when the AI explicitly says it cannot find the firm', () => {
    const response =
      'I could not find Celtic Frozen Drinks in my results. Here are other suppliers: Sun Magic Juices, Nutrivend.';
    const parsed = parsePlatformResponse(response, 'Celtic Frozen Drinks Ltd');
    expect(parsed.mentioned).toBe(false);
  });
});

describe('parsePlatformResponse — Issue 2 regression (same-firm-as-competitor)', () => {
  it('does not list the firm as its own competitor when listed with a suffix variant', () => {
    const response = `Here are 5 recommended frozen drinks suppliers:

1. Sun Magic Juices - specialist juice producer
2. Nutrivend - vending and drinks machines
3. Celtic Frozen Drinks Ltd - local frozen drinks supplier
4. Slush Puppie - frozen drinks brand
`;
    const parsed = parsePlatformResponse(response, 'Celtic Frozen Drinks');
    const competitorNames = parsed.competitors.map((c) => c.name.toLowerCase());
    for (const name of competitorNames) {
      expect(name).not.toContain('celtic frozen drinks');
    }
  });

  it('does not list the firm as its own competitor when the firm carries the suffix', () => {
    const response = `Here are 5 recommended frozen drinks suppliers:

1. Sun Magic Juices - specialist juice producer
2. Nutrivend - vending and drinks machines
3. Celtic Frozen Drinks - local frozen drinks supplier
`;
    const parsed = parsePlatformResponse(response, 'Celtic Frozen Drinks Ltd');
    const competitorNames = parsed.competitors.map((c) => c.name.toLowerCase());
    for (const name of competitorNames) {
      expect(name).not.toContain('celtic frozen drinks');
    }
  });

  it('keeps unrelated firms in the competitor list', () => {
    const response = `1. Sun Magic Juices - specialist juice producer
2. Nutrivend - vending and drinks machines
3. Celtic Frozen Drinks Ltd - local frozen drinks supplier
`;
    const parsed = parsePlatformResponse(response, 'Celtic Frozen Drinks');
    const names = parsed.competitors.map((c) => c.name);
    expect(names).toContain('Sun Magic Juices');
    expect(names).toContain('Nutrivend');
  });
});
