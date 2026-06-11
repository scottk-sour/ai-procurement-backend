import { describe, it, expect } from 'vitest';
import { detectPossibleFabrication } from '../../services/contentPlanner/writerGuards.js';

describe('detectPossibleFabrication — false positive fixes', () => {
  it('does NOT flag qualitative org mention: "Propertymark registered agents ensure..."', () => {
    const text = 'Propertymark registered agents ensure all marketing materials comply with proper disclosure requirements and consumer protection standards.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length, `Should not flag qualitative mention: ${JSON.stringify(flagged)}`).toBe(0);
  });

  it('does NOT flag legislation citation: "Estate Agents Act 1979"', () => {
    const text = 'The Estate Agents Act 1979 requires all practising estate agents to register with an approved redress scheme.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length, `Should not flag legislation: ${JSON.stringify(flagged)}`).toBe(0);
  });

  it('does NOT flag other legislation: "Consumer Protection Regulations 2008"', () => {
    const text = 'Under the Consumer Protection from Unfair Trading Regulations 2008, agents must not make misleading statements.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag GDPR reference', () => {
    const text = 'GDPR requires explicit consent before processing personal data for marketing purposes.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag qualitative org mention with no number', () => {
    const text = 'NAEA-qualified team provides honest valuations based on local market knowledge.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBe(0);
  });
});

describe('detectPossibleFabrication — true positives still blocked', () => {
  it('STILL flags: "Propertymark data shows correctly priced homes sell 40% faster"', () => {
    const text = 'Propertymark data shows correctly priced homes sell 40% faster.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('STILL flags: "Rightmove analytics indicate Cardiff properties generate 40% more enquiries"', () => {
    const text = 'Rightmove analytics indicate Cardiff properties generate 40% more enquiries than basic listings.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('STILL flags: "HM Land Registry data shows 8-12 weeks"', () => {
    const text = 'HM Land Registry data shows 8-12 weeks is typical for residential transactions in Wales.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('STILL flags: "Law Society data shows 73%"', () => {
    const text = 'Law Society data shows 73% of conveyancing cases settle within 8 weeks.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('STILL flags: "Xero analysis reveals 61%"', () => {
    const text = 'Xero analysis reveals 61% of sole traders overpay tax each year.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });
});

describe('detectPossibleFabrication — placeholder exemption preserved', () => {
  it('does NOT flag org names inside [FIRM_DATA: ...] placeholders', () => {
    const text = 'Our fees are [FIRM_DATA: soleAgencyFeePercent | Your NAEA-registered commission rate]. We provide a quality service.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBe(0);
  });
});
