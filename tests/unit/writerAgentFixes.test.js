import { describe, it, expect } from 'vitest';
import { buildCtaForVendor, detectPossibleFabrication } from '../../services/contentPlanner/writerGuards.js';

describe('buildCtaForVendor', () => {
  it('returns vendor profile URL for Pro vendor', () => {
    const cta = buildCtaForVendor({ tier: 'pro', slug: 'harrison-co', company: 'Harrison & Co' });
    expect(cta.ctaUrl).toBe('https://www.tendorai.com/suppliers/vendor/harrison-co');
    expect(cta.ctaText).toBe('Get in touch with Harrison & Co');
  });

  it('returns vendor profile URL for verified vendor', () => {
    const cta = buildCtaForVendor({ tier: 'verified', slug: 'test-firm', company: 'Test Firm' });
    expect(cta.ctaUrl).toContain('/suppliers/vendor/test-firm');
  });

  it('returns vendor profile URL for managed vendor', () => {
    const cta = buildCtaForVendor({ tier: 'managed', slug: 'cardiff-pp', company: 'Cardiff PP' });
    expect(cta.ctaUrl).toContain('/suppliers/vendor/cardiff-pp');
  });

  it('returns AEO funnel URL for free vendor', () => {
    const cta = buildCtaForVendor({ tier: 'free', slug: 'free-firm', company: 'Free Firm' });
    expect(cta.ctaUrl).toBe('https://www.tendorai.com/aeo-report');
    expect(cta.ctaText).toBe('Get your free AI Visibility Report');
  });
});

describe('detectPossibleFabrication', () => {
  it('catches "Propertymark analysis of 45,000 transactions shows..."', () => {
    const text = 'Propertymark analysis of 45,000 transactions shows that traditional agents achieve 97.2% of asking price.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0].body).toBe('Propertymark');
  });

  it('catches "RICS data indicates 73%..."', () => {
    const text = 'RICS data indicates 73% of conveyancers comply with the new framework.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('catches "According to the Property Ombudsman..."', () => {
    const text = 'According to the Property Ombudsman, complaints rose by 12% in their 2024 report.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('does NOT flag qualitative claims without numbers', () => {
    const text = 'Traditional estate agents often achieve higher final sale prices than online agents, though this varies by property type.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged).toHaveLength(0);
  });

  it('does NOT flag generic price ranges without attributed bodies', () => {
    const text = 'Conveyancing fees in England and Wales typically range from £800 to £2,000.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged).toHaveLength(0);
  });

  it('does NOT flag generic qualitative industry claims', () => {
    const text = 'Industry data suggests online conveyancing has grown sharply since 2020. Many firms now offer fixed fees.';
    const flagged = detectPossibleFabrication(text);
    expect(flagged).toHaveLength(0);
  });
});
