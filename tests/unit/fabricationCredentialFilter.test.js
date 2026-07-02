import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isGenericTone,
  extractVerifiedCredentials,
} from '../../services/contentPlanner/fabricationReview.js';

describe('extractVerifiedCredentials', () => {
  it('extracts propertymark from verified_credentials block', () => {
    const ctx = `<firm_context>
<verified_credentials>
The following credentials are confirmed on file. Claims matching these are VERIFIED and must NOT be flagged.
This firm IS Propertymark-registered (number: PM-DEMO-001).
</verified_credentials>
</firm_context>`;
    const creds = extractVerifiedCredentials(ctx);
    expect(creds).toContain('propertymark');
  });

  it('extracts TPO membership', () => {
    const ctx = `<firm_context>
<verified_credentials>
The following credentials are confirmed on file. Claims matching these are VERIFIED and must NOT be flagged.
This firm IS Propertymark-registered (number: PM-DEMO-001).
This firm is a member of: The Property Ombudsman.
</verified_credentials>
</firm_context>`;
    const creds = extractVerifiedCredentials(ctx);
    expect(creds).toContain('propertymark');
    expect(creds).toContain('the property ombudsman');
  });

  it('extracts multiple regulatory numbers', () => {
    const ctx = `<verified_credentials>
This firm IS registered with the SRA (number: 123456).
This firm IS FCA-authorised (number: FCA-789).
</verified_credentials>`;
    const creds = extractVerifiedCredentials(ctx);
    expect(creds).toContain('sra');
    expect(creds).toContain('fca');
  });

  it('returns empty for missing context', () => {
    expect(extractVerifiedCredentials('')).toEqual([]);
    expect(extractVerifiedCredentials(null)).toEqual([]);
  });

  it('returns empty when no verified_credentials block', () => {
    const ctx = '<firm_context>{"company":"Test"}</firm_context>';
    expect(extractVerifiedCredentials(ctx)).toEqual([]);
  });
});

describe('isGenericTone', () => {
  it('matches "we take every complaint seriously"', () => {
    expect(isGenericTone('At Cardiff Property Partners, we take every complaint seriously')).toBe(true);
  });

  it('matches "our process begins the moment you contact us"', () => {
    expect(isGenericTone('Our process begins from the moment you get in touch')).toBe(true);
  });

  it('matches "we pride ourselves on service"', () => {
    expect(isGenericTone('We pride ourselves on delivering outstanding service')).toBe(true);
  });

  it('matches "your satisfaction is our priority"', () => {
    expect(isGenericTone('Your satisfaction is our priority and we work to earn it')).toBe(true);
  });

  it('matches "we aim to keep you informed at every stage"', () => {
    expect(isGenericTone('We aim to keep you informed throughout the process')).toBe(true);
  });

  it('does NOT match claims with numbers (those need real verification)', () => {
    expect(isGenericTone('We handle 500 cases per year')).toBe(false);
    expect(isGenericTone('We resolve 95% of complaints within 48 hours')).toBe(false);
  });

  it('does NOT match credential claims', () => {
    expect(isGenericTone('We are Propertymark-registered')).toBe(false);
  });

  it('returns false for null/empty', () => {
    expect(isGenericTone(null)).toBe(false);
    expect(isGenericTone('')).toBe(false);
  });
});

describe('deterministic post-filter: verified credentials + generic tone', () => {
  async function runWithMockedLlm(llmResponse, draftText, firmContext, vertical) {
    vi.resetModules();
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(llmResponse) }],
    });
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        constructor() { this.messages = { create: mockCreate }; }
      },
    }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const mod = await import('../../services/contentPlanner/fabricationReview.js');
    return mod.reviewDraftForFabrication({ draftText, firmContext, vertical });
  }

  it('draft with "we are Propertymark-registered" + verified credential → NOT flagged', async () => {
    const firmContext = `<firm_context>
{"regulatoryNumbers":{"propertymark":"PM-DEMO-001"}}
<verified_credentials>
The following credentials are confirmed on file. Claims matching these are VERIFIED and must NOT be flagged.
This firm IS Propertymark-registered (number: PM-DEMO-001).
This firm is a member of: The Property Ombudsman.
</verified_credentials>
</firm_context>`;

    const result = await runWithMockedLlm(
      {
        fabricatedAttributions: [],
        firmClaimsNotInContext: [
          { claim: 'we are Propertymark-registered and TPO members' },
        ],
        qualityScore: 9,
        verdict: 'fail',
      },
      'We are Propertymark-registered and TPO members.',
      firmContext,
      'estate-agent',
    );

    expect(result.reviewRan).toBe(true);
    expect(result.firmClaimsNotInContext).toHaveLength(0);
    expect(result.verdict).toBe('pass');
  });

  it('draft with "we take every complaint seriously" (generic tone) → NOT flagged', async () => {
    const result = await runWithMockedLlm(
      {
        fabricatedAttributions: [],
        firmClaimsNotInContext: [
          { claim: 'At Cardiff Property Partners, we take every complaint seriously' },
        ],
        qualityScore: 9,
        verdict: 'fail',
      },
      'At Cardiff Property Partners, we take every complaint seriously.',
      '<firm_context>{"company":"Cardiff Property Partners"}</firm_context>',
      'estate-agent',
    );

    expect(result.reviewRan).toBe(true);
    expect(result.firmClaimsNotInContext).toHaveLength(0);
    expect(result.verdict).toBe('pass');
  });

  it('draft claiming "we are RICS-regulated" when NOT on file → STILL flagged', async () => {
    const firmContext = `<firm_context>
{"regulatoryNumbers":{"propertymark":"PM-DEMO-001"}}
<verified_credentials>
The following credentials are confirmed on file. Claims matching these are VERIFIED and must NOT be flagged.
This firm IS Propertymark-registered (number: PM-DEMO-001).
</verified_credentials>
</firm_context>`;

    const result = await runWithMockedLlm(
      {
        fabricatedAttributions: [],
        firmClaimsNotInContext: [
          { claim: 'we are RICS-regulated professionals' },
        ],
        qualityScore: 7,
        verdict: 'fail',
      },
      'As RICS-regulated professionals, we maintain the highest standards.',
      firmContext,
      'estate-agent',
    );

    expect(result.reviewRan).toBe(true);
    expect(result.firmClaimsNotInContext.length).toBeGreaterThan(0);
    expect(result.firmClaimsNotInContext[0].claim).toContain('RICS');
    expect(result.verdict).toBe('fail');
  });
});
