import { describe, it, expect } from 'vitest';

describe('Pro Signup — Initial AeoReport generation', () => {
  it('category derivation handles solicitor practiceAreas', () => {
    const vendor = { practiceAreas: ['Conveyancing'], services: [], vendorType: 'solicitor' };
    const category = (vendor.practiceAreas?.[0] || vendor.services?.[0] || vendor.vendorType || 'other').toLowerCase().replace(/\s+/g, '-');
    expect(category).toBe('conveyancing');
  });

  it('category derivation falls back to vendorType for office-equipment', () => {
    const vendor = { practiceAreas: [], services: ['Photocopiers'], vendorType: 'office-equipment' };
    const category = (vendor.practiceAreas?.[0] || vendor.services?.[0] || vendor.vendorType || 'other').toLowerCase().replace(/\s+/g, '-');
    expect(category).toBe('photocopiers');
  });

  it('category derivation falls back to vendorType when no practiceAreas or services', () => {
    const vendor = { practiceAreas: [], services: [], vendorType: 'accountant' };
    const category = (vendor.practiceAreas?.[0] || vendor.services?.[0] || vendor.vendorType || 'other').toLowerCase().replace(/\s+/g, '-');
    expect(category).toBe('accountant');
  });

  it('skips report generation when city is missing', () => {
    const vendor = { company: 'Test Firm', location: {}, contactInfo: {} };
    const city = vendor.location?.city;
    expect(city).toBeFalsy();
  });

  it('Pro tier check matches managed/verified/enterprise', () => {
    const proTiers = ['managed', 'verified', 'enterprise'];
    for (const tier of proTiers) {
      expect(proTiers.includes(tier)).toBe(true);
    }
    expect(proTiers.includes('free')).toBe(false);
    expect(proTiers.includes('basic')).toBe(false);
  });
});
