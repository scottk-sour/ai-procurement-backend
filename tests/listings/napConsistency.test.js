import { describe, it, expect } from 'vitest';
import { compareNap } from '../../services/listings/napConsistency.js';

describe('compareNap', () => {
  it('empty canonical phone → unverifiable, NOT mismatch', () => {
    const canonical = { name: 'Smith Solicitors', phone: '', postcode: 'CF10 1AA', address: '10 High St' };
    const scraped = { name: 'Smith Solicitors', phone: '029 2000 1234', postcode: 'CF10 1AA', address: '10 High St' };
    const result = compareNap(canonical, scraped);
    expect(result.phone).toBe('unverifiable');
  });

  it('empty scraped phone → unverifiable', () => {
    const canonical = { name: 'Smith Solicitors', phone: '029 2000 1234', postcode: 'CF10 1AA', address: '' };
    const scraped = { name: 'Smith Solicitors', phone: '', postcode: 'CF10 1AA', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.phone).toBe('unverifiable');
  });

  it('matching phone with different formatting → match', () => {
    const canonical = { name: 'Smith', phone: '029 2000 1234', postcode: '', address: '' };
    const scraped = { name: 'Smith', phone: '02920001234', postcode: '', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.phone).toBe('match');
  });

  it('+44 normalisation → match', () => {
    const canonical = { name: 'Smith', phone: '029 2000 1234', postcode: '', address: '' };
    const scraped = { name: 'Smith', phone: '+44 29 2000 1234', postcode: '', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.phone).toBe('match');
  });

  it('different phone numbers → phone_mismatch', () => {
    const canonical = { name: 'Smith', phone: '029 2000 1234', postcode: '', address: '' };
    const scraped = { name: 'Smith', phone: '029 9999 8888', postcode: '', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.phone).toBe('phone_mismatch');
  });

  it('postcode normalise (spaces, case) → match', () => {
    const canonical = { name: 'Smith', phone: '', postcode: 'cf10 1aa', address: '' };
    const scraped = { name: 'Smith', phone: '', postcode: 'CF101AA', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.postcode).toBe('match');
  });

  it('different postcodes → mismatch', () => {
    const canonical = { name: 'Smith', phone: '', postcode: 'CF10 1AA', address: '' };
    const scraped = { name: 'Smith', phone: '', postcode: 'CF24 3BB', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.postcode).toBe('mismatch');
  });

  it('empty canonical postcode → unverifiable', () => {
    const canonical = { name: 'Smith', phone: '', postcode: '', address: '' };
    const scraped = { name: 'Smith', phone: '', postcode: 'CF10 1AA', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.postcode).toBe('unverifiable');
  });

  it('name_variation via isSameFirm — different suffix', () => {
    const canonical = { name: 'Harrison & Co', phone: '', postcode: '', address: '' };
    const scraped = { name: 'Jones Walker LLP', phone: '', postcode: '', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.name).toBe('name_variation');
  });

  it('name match via isSameFirm — same name different suffix', () => {
    const canonical = { name: 'Harrison & Co', phone: '', postcode: '', address: '' };
    const scraped = { name: 'Harrison & Co Solicitors Ltd', phone: '', postcode: '', address: '' };
    const result = compareNap(canonical, scraped);
    expect(result.name).toBe('match');
  });

  it('address never hard-mismatches — uses soft address_variation', () => {
    const canonical = { name: 'Smith', phone: '', postcode: '', address: '10 High Street, Cardiff' };
    const scraped = { name: 'Smith', phone: '', postcode: '', address: '55 Queen Road, Bristol' };
    const result = compareNap(canonical, scraped);
    expect(result.address).not.toBe('mismatch');
    expect(['address_variation', 'match', 'unverifiable']).toContain(result.address);
  });

  it('null scraped → all unverifiable', () => {
    const canonical = { name: 'Smith', phone: '029 2000 1234', postcode: 'CF10 1AA', address: '10 High St' };
    const result = compareNap(canonical, null);
    expect(result.name).toBe('unverifiable');
    expect(result.phone).toBe('unverifiable');
    expect(result.postcode).toBe('unverifiable');
    expect(result.address).toBe('unverifiable');
  });
});
