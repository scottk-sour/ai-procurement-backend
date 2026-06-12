import { describe, it, expect } from 'vitest';
import { detectFirmPerformanceClaims } from '../../services/contentPlanner/writerGuards.js';

describe('detectFirmPerformanceClaims — false positives (must pass)', () => {
  it('does NOT flag mid-word boundary fragments', () => {
    const text = 'Cardiff Property Partners is registered with Propertymark and provides professional estate agency services across the city.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag generic marketing text', () => {
    const text = 'Our marketing strategy maximises buyer exposure throughout Cardiff and the surrounding Vale of Glamorgan area.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag legislation: "Estate Agents Act 1979"', () => {
    const text = 'Under the Estate Agents Act 1979, all practising agents must join an approved redress scheme.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag numbered list items', () => {
    const text = '1. Accurate pricing attracts more buyer interest.\n2. Professional photography improves sales outcomes.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag placeholder tokens', () => {
    const text = 'We sold [FIRM_DATA: propertiesSoldThisYear | Number of properties sold] properties last year.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag bulleted list with generic process info', () => {
    const text = '- **Property valuation stage**: Estate agents assess market value using comparable sales data and current market conditions in Cardiff\n- **Marketing preparation**: Professional photography, floorplans, and 12 portal listings prepared within 48 hours';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag markdown table with generic timeframes', () => {
    const text = '## Cardiff Property Sales Timeframes in 2026\n| Stage | Typical Duration | Key Activities |\n|-------|------------------|----------------|\n| Valuation to marketing | 1-2 weeks | Photography, EPC |\n| On market to offer | 4-8 weeks | Viewings |';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag generic industry prose: "Sales typically take 4-8 weeks in Cardiff"', () => {
    const text = 'Sales typically take 4-8 weeks in Cardiff depending on market conditions.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag "The average Cardiff sale completes in 3-6 months"', () => {
    const text = 'The average Cardiff sale completes in 3-6 months from instruction to keys.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });
});

describe('detectFirmPerformanceClaims — true positives (must flag)', () => {
  it('flags "Cardiff Property Partners sold 87 properties last year"', () => {
    const text = 'Cardiff Property Partners sold 87 properties in the last year.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('flags "We achieved 98% across 87 transactions"', () => {
    const text = 'We achieved 98% of asking prices across 87 transactions.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('flags "Our team completed 150 cases"', () => {
    const text = 'Our team completed 150 cases last quarter with an average turnaround of 28 days.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('flags hedged firm claim: "We typically sell homes in 18 days"', () => {
    const text = 'We typically sell homes in 18 days.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('flags hedged firm claim: "Our average completion time is 10 weeks"', () => {
    const text = 'Our average completion time is 10 weeks.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBeGreaterThan(0);
  });
});
