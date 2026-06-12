import { describe, it, expect } from 'vitest';
import { detectFirmPerformanceClaims } from '../../services/contentPlanner/writerGuards.js';

describe('detectFirmPerformanceClaims — false positive fixes', () => {
  it('does NOT flag mid-word boundary fragments like "rtners is registered with Propertymark"', () => {
    const text = 'Cardiff Property Partners is registered with Propertymark and provides professional estate agency services across the city.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length, `Should not flag: ${JSON.stringify(flagged)}`).toBe(0);
  });

  it('does NOT flag "uyer exposure throughout Cardiff"', () => {
    const text = 'Our marketing strategy maximises buyer exposure throughout Cardiff and the surrounding Vale of Glamorgan area.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag legislation with year: "Estate Agents Act 1979"', () => {
    const text = 'Under the Estate Agents Act 1979, all practising agents must join an approved redress scheme. Sales proceed under these regulations.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag numbered list items like "1. Accurate pricing"', () => {
    const text = '1. Accurate pricing attracts more buyer interest.\n2. Professional photography improves sales outcomes.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });

  it('does NOT flag placeholder tokens', () => {
    const text = 'We sold [FIRM_DATA: propertiesSoldThisYear | Number of properties sold] properties last year.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBe(0);
  });
});

describe('detectFirmPerformanceClaims — true positives still blocked', () => {
  it('STILL flags "sold 87 properties"', () => {
    const text = 'Cardiff Property Partners sold 87 properties in the last year.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('STILL flags "achieved 98% across 87 transactions"', () => {
    const text = 'We achieved 98% of asking prices across 87 transactions.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('STILL flags "completed 150 cases"', () => {
    const text = 'Our team completed 150 cases last quarter with an average turnaround of 28 days.';
    const flagged = detectFirmPerformanceClaims(text);
    expect(flagged.length).toBeGreaterThan(0);
  });
});
