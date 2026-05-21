import { describe, it, expect } from 'vitest';
import { getCanonicalNap } from '../../services/listings/canonicalNap.js';

describe('getCanonicalNap', () => {
  it('returns vendor fields when no firmData overlay', () => {
    const vendor = {
      company: 'Smith Solicitors',
      location: { address: '10 High St', postcode: 'CF10 1AA' },
      contactInfo: { phone: '029 2000 1234', website: 'https://smith.co.uk' },
    };
    const nap = getCanonicalNap(vendor);
    expect(nap.name).toBe('Smith Solicitors');
    expect(nap.address).toBe('10 High St');
    expect(nap.postcode).toBe('CF10 1AA');
    expect(nap.phone).toBe('029 2000 1234');
    expect(nap.website).toBe('https://smith.co.uk');
    expect(nap.phoneConfirmed).toBe(false);
    expect(nap.nameConfirmed).toBe(false);
  });

  it('firmData overlay wins over vendor fields', () => {
    const firmData = new Map();
    firmData.set('canonical_trading_name', { value: 'Smith & Co Solicitors' });
    firmData.set('canonical_phone', { value: '029 9999 0000' });
    firmData.set('canonical_address', { value: '20 Queen St' });
    firmData.set('canonical_postcode', { value: 'CF10 2BB' });
    firmData.set('canonical_website', { value: 'https://smithco.co.uk' });

    const vendor = {
      company: 'Smith Solicitors Ltd',
      location: { address: '10 High St', postcode: 'CF10 1AA' },
      contactInfo: { phone: '029 2000 1234', website: 'https://smith.co.uk' },
      firmData,
    };
    const nap = getCanonicalNap(vendor);
    expect(nap.name).toBe('Smith & Co Solicitors');
    expect(nap.phone).toBe('029 9999 0000');
    expect(nap.address).toBe('20 Queen St');
    expect(nap.postcode).toBe('CF10 2BB');
    expect(nap.website).toBe('https://smithco.co.uk');
    expect(nap.phoneConfirmed).toBe(true);
    expect(nap.nameConfirmed).toBe(true);
  });

  it('empty firmData values fall through to vendor fields', () => {
    const firmData = new Map();
    firmData.set('canonical_phone', { value: '' });
    const vendor = {
      company: 'Jones LLP',
      location: { address: '', postcode: '' },
      contactInfo: { phone: '01onal', website: '' },
      firmData,
    };
    const nap = getCanonicalNap(vendor);
    expect(nap.phone).toBe('01onal');
    expect(nap.phoneConfirmed).toBe(false);
  });

  it('handles missing vendor fields gracefully', () => {
    const nap = getCanonicalNap({});
    expect(nap.name).toBe('');
    expect(nap.phone).toBe('');
    expect(nap.postcode).toBe('');
    expect(nap.address).toBe('');
    expect(nap.website).toBe('');
  });
});
