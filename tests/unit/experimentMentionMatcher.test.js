import { describe, it, expect } from 'vitest';
import { normaliseFirmName, normaliseResponseText, isFirmMentioned } from '../../scripts/experiments/lib/mentionMatcher.js';

// ── Real response fixtures from study_2026_07_exp001 ──

const PERPLEXITY_CARDIFF_RESPONSE = `Here are some well-regarded conveyancing solicitors in Cardiff:

1. **Howells Solicitors** - A well-established firm in Cardiff with a strong reputation for residential and commercial conveyancing work.

2. **Hek Jones Limited** - Known for their expertise in property transactions across South Wales, particularly in the Cardiff area.

3. **JWP Solicitors** - Offer comprehensive conveyancing services with a focus on client communication throughout the process.

4. **Robertsons Solicitors** - A Cardiff-based firm providing residential conveyancing services with competitive fees.

5. **Darwin Gray LLP** - A reputable commercial law firm in Cardiff that also handles residential property matters.`;

const CHATGPT_CARDIFF_RESPONSE = `When looking for conveyancing solicitors in Cardiff, here are some firms worth considering:

1. Howells - They have been operating in Cardiff for many years and handle a wide range of property transactions.
2. JWP Solicitors - Based in central Cardiff, they offer fixed-fee conveyancing packages.
3. Wendy Hopkins Family Law Practice - While primarily a family law firm, they also assist with property matters.
4. Harris & Harris Solicitors - A well-known name in Cardiff legal circles with conveyancing expertise.
5. Ackland & Co - They specialise in residential property work across the Cardiff region.`;

const GEMINI_GENERIC_RESPONSE = `I can suggest some solicitors in Cardiff who handle conveyancing:

Based on my research, firms like Hek Jones and Robertson & Co are frequently mentioned for property work in the Cardiff area. Additionally, Blake Morgan has a significant presence in South Wales.`;

// ── normaliseFirmName tests ──

describe('normaliseFirmName', () => {
  it('strips "Solicitors" suffix', () => {
    expect(normaliseFirmName('Howells Solicitors')).toBe('howells');
  });

  it('strips "Limited" suffix', () => {
    expect(normaliseFirmName('Hek Jones Limited')).toBe('hek jones');
  });

  it('strips "LLP" suffix', () => {
    expect(normaliseFirmName('Darwin Gray LLP')).toBe('darwin gray');
  });

  it('strips "& Co" suffix', () => {
    expect(normaliseFirmName('Ackland & Co')).toBe('ackland');
  });

  it('treats & and "and" as equivalent', () => {
    expect(normaliseFirmName('Harris & Harris')).toBe('harris and harris');
  });

  it('strips "Law" suffix', () => {
    expect(normaliseFirmName('Wendy Hopkins Family Law Practice')).not.toContain('law');
  });

  it('handles multiple suffixes', () => {
    expect(normaliseFirmName('Smith Jones Solicitors Ltd')).toBe('smith jones');
  });

  it('returns lowercase', () => {
    expect(normaliseFirmName('JWP Solicitors')).toBe('jwp');
  });
});

// ── isFirmMentioned against real responses ──

describe('isFirmMentioned — Perplexity Cardiff response', () => {
  it('finds "Howells Solicitors"', () => {
    expect(isFirmMentioned(PERPLEXITY_CARDIFF_RESPONSE, 'Howells Solicitors')).toBe(true);
  });

  it('finds "Hek Jones Limited"', () => {
    expect(isFirmMentioned(PERPLEXITY_CARDIFF_RESPONSE, 'Hek Jones Limited')).toBe(true);
  });

  it('finds "JWP Solicitors"', () => {
    expect(isFirmMentioned(PERPLEXITY_CARDIFF_RESPONSE, 'JWP Solicitors')).toBe(true);
  });

  it('finds "Darwin Gray LLP"', () => {
    expect(isFirmMentioned(PERPLEXITY_CARDIFF_RESPONSE, 'Darwin Gray LLP')).toBe(true);
  });

  it('does NOT find a firm not in the response', () => {
    expect(isFirmMentioned(PERPLEXITY_CARDIFF_RESPONSE, 'Blake Morgan LLP')).toBe(false);
  });
});

describe('isFirmMentioned — ChatGPT Cardiff response', () => {
  it('finds "Howells" (no suffix in response)', () => {
    expect(isFirmMentioned(CHATGPT_CARDIFF_RESPONSE, 'Howells Solicitors')).toBe(true);
  });

  it('finds "JWP Solicitors"', () => {
    expect(isFirmMentioned(CHATGPT_CARDIFF_RESPONSE, 'JWP Solicitors')).toBe(true);
  });

  it('finds "Harris & Harris Solicitors"', () => {
    expect(isFirmMentioned(CHATGPT_CARDIFF_RESPONSE, 'Harris & Harris Solicitors')).toBe(true);
  });

  it('finds "Ackland & Co"', () => {
    expect(isFirmMentioned(CHATGPT_CARDIFF_RESPONSE, 'Ackland & Co')).toBe(true);
  });
});

describe('isFirmMentioned — Gemini response', () => {
  it('finds "Hek Jones" in prose', () => {
    expect(isFirmMentioned(GEMINI_GENERIC_RESPONSE, 'Hek Jones Limited')).toBe(true);
  });

  it('finds "Blake Morgan"', () => {
    expect(isFirmMentioned(GEMINI_GENERIC_RESPONSE, 'Blake Morgan LLP')).toBe(true);
  });
});

// ── False positive guards ──

describe('isFirmMentioned — false positive guards', () => {
  it('does NOT match "Harris" alone against prose containing "Harris"', () => {
    const text = 'The Harris report shows market trends in Cardiff.';
    expect(isFirmMentioned(text, 'Harris Solicitors')).toBe(false);
  });

  it('DOES match "Harris & Harris" as a multi-token name', () => {
    const text = 'We recommend Harris & Harris for property work.';
    expect(isFirmMentioned(text, 'Harris & Harris Solicitors')).toBe(true);
  });

  it('does NOT match very short single-token names (< 4 chars)', () => {
    const text = 'The law requires all parties to comply.';
    expect(isFirmMentioned(text, 'Law Ltd')).toBe(false);
  });

  it('returns false for null/empty inputs', () => {
    expect(isFirmMentioned(null, 'Firm')).toBe(false);
    expect(isFirmMentioned('text', null)).toBe(false);
    expect(isFirmMentioned('', 'Firm')).toBe(false);
  });

  it('handles markdown bold around firm name', () => {
    expect(isFirmMentioned('Try **Hek Jones** for conveyancing.', 'Hek Jones Limited')).toBe(true);
  });
});
