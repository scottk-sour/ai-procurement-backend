import { describe, it, expect } from 'vitest';
import { generateVendorSchema } from '../../utils/generateVendorSchema.js';

function makeVendor(overrides = {}) {
  return {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    company: 'Test Firm',
    email: 'test@example.com',
    tier: 'pro',
    vendorType: 'estate-agent',
    location: { city: 'Cardiff', postcode: 'CF10 1FA' },
    contactInfo: { phone: '029 2000 0000', website: 'https://example.com' },
    services: ['Estate Agents'],
    ...overrides,
  };
}

describe('generateVendorSchema — credential gating', () => {

  it('demo vendor with PM-DEMO-001 STILL emits Propertymark identifier', () => {
    const vendor = makeVendor({
      _id: '699757a97712b4369510e6c8',
      isDemoVendor: true,
      propertymarkNumber: 'PM-DEMO-001',
    });
    const schema = generateVendorSchema(vendor);
    const ids = schema.identifier || [];
    const pmId = ids.find(i => i.name === 'Propertymark Number');
    expect(pmId).toBeDefined();
    expect(pmId.value).toBe('PM-DEMO-001');

    const creds = schema.hasCredential || [];
    const pmCred = creds.find(c => c.name === 'Propertymark Membership');
    expect(pmCred).toBeDefined();
    expect(pmCred.identifier).toBe('PM-DEMO-001');
  });

  it('non-demo vendor with placeholder "TBC" emits NO regulator identifier', () => {
    const vendor = makeVendor({ propertymarkNumber: 'TBC' });
    const schema = generateVendorSchema(vendor);
    const ids = (schema.identifier || []).filter(i => i.name === 'Propertymark Number');
    expect(ids).toHaveLength(0);

    const creds = (schema.hasCredential || []).filter(c => c.name === 'Propertymark Membership');
    expect(creds).toHaveLength(0);
  });

  it('non-demo vendor with placeholder "pending" emits NO regulator identifier', () => {
    const vendor = makeVendor({ sraNumber: 'pending' });
    const schema = generateVendorSchema(vendor);
    const ids = (schema.identifier || []).filter(i => i.name === 'SRA Number');
    expect(ids).toHaveLength(0);
  });

  it('non-demo vendor with "PM-000" placeholder emits NO credential', () => {
    const vendor = makeVendor({ propertymarkNumber: 'PM-DEMO-999' });
    const schema = generateVendorSchema(vendor);
    const ids = (schema.identifier || []).filter(i => i.name === 'Propertymark Number');
    expect(ids).toHaveLength(0);
  });

  it('non-demo vendor with real number DOES emit identifier and credential', () => {
    const vendor = makeVendor({ sraNumber: '654321' });
    const schema = generateVendorSchema(vendor);
    const ids = (schema.identifier || []).filter(i => i.name === 'SRA Number');
    expect(ids).toHaveLength(1);
    expect(ids[0].value).toBe('654321');

    const creds = (schema.hasCredential || []).filter(c => c.name === 'SRA Registration');
    expect(creds).toHaveLength(1);
    expect(creds[0].identifier).toBe('654321');
  });

  it('Pro-but-not-verified non-demo vendor does NOT get TendorAI Verified identifier', () => {
    const vendor = makeVendor({
      tier: 'pro',
      account: { verificationStatus: 'unverified' },
    });
    const schema = generateVendorSchema(vendor);
    const tendoraiId = (schema.identifier || []).find(i => i.name === 'TendorAI Verified');
    expect(tendoraiId).toBeUndefined();
  });

  it('verified-account vendor DOES get TendorAI Verified identifier', () => {
    const vendor = makeVendor({
      tier: 'pro',
      account: { verificationStatus: 'verified' },
    });
    const schema = generateVendorSchema(vendor);
    const tendoraiId = (schema.identifier || []).find(i => i.name === 'TendorAI Verified');
    expect(tendoraiId).toBeDefined();
  });

  it('demo vendor DOES get TendorAI Verified identifier', () => {
    const vendor = makeVendor({ isDemoVendor: true });
    const schema = generateVendorSchema(vendor);
    const tendoraiId = (schema.identifier || []).find(i => i.name === 'TendorAI Verified');
    expect(tendoraiId).toBeDefined();
  });
});
