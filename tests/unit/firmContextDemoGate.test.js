import { describe, it, expect } from 'vitest';
import { isDemoFirm } from '../../lib/config/demoVendors.js';

describe('_rawFirmForGate carries demo identity', () => {
  it('isDemoFirm is true when _id is a known demo vendor', () => {
    const firmForGate = { _id: '699757a97712b4369510e6c8', vendorType: 'estate-agent', propertymarkNumber: 'PM-DEMO-001' };
    expect(isDemoFirm(firmForGate)).toBe(true);
  });
  it('isDemoFirm is true when isDemoVendor flag is set', () => {
    expect(isDemoFirm({ isDemoVendor: true })).toBe(true);
  });
  it('isDemoFirm is false for a normal firm', () => {
    expect(isDemoFirm({ _id: 'abc123', vendorType: 'estate-agent' })).toBe(false);
  });
});
