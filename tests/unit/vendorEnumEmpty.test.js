import { describe, it, expect } from 'vitest';

// Test the pre-validate stripping logic directly — same algorithm as the hook
const OPTIONAL_ENUM_FIELDS = [
  'feeModel', 'tenantFindOrFullManagement', 'leaseVsPurchase', 'feeStructureType',
  'serviceCapabilities.responseTime', 'serviceCapabilities.supportHours',
  'commercial.creditRating', 'commercial.paymentTerms',
  'integration.pricingUpdateFrequency',
];

function stripEmptyEnums(obj) {
  for (const path of OPTIONAL_ENUM_FIELDS) {
    const parts = path.split('.');
    let target = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      target = target?.[parts[i]];
      if (!target) break;
    }
    if (target) {
      const field = parts[parts.length - 1];
      if (target[field] === '') {
        target[field] = undefined;
      }
    }
  }
  return obj;
}

describe('Vendor enum empty-string stripping', () => {
  it('converts empty string to undefined for all optional enum fields', () => {
    const obj = {
      feeModel: '',
      tenantFindOrFullManagement: '',
      leaseVsPurchase: '',
      feeStructureType: '',
      serviceCapabilities: { responseTime: '', supportHours: '' },
      commercial: { creditRating: '', paymentTerms: '' },
      integration: { pricingUpdateFrequency: '' },
    };
    stripEmptyEnums(obj);

    expect(obj.feeModel).toBeUndefined();
    expect(obj.tenantFindOrFullManagement).toBeUndefined();
    expect(obj.leaseVsPurchase).toBeUndefined();
    expect(obj.feeStructureType).toBeUndefined();
    expect(obj.serviceCapabilities.responseTime).toBeUndefined();
    expect(obj.serviceCapabilities.supportHours).toBeUndefined();
    expect(obj.commercial.creditRating).toBeUndefined();
    expect(obj.commercial.paymentTerms).toBeUndefined();
    expect(obj.integration.pricingUpdateFrequency).toBeUndefined();
  });

  it('leaves valid enum values untouched', () => {
    const obj = {
      feeModel: 'fee',
      tenantFindOrFullManagement: 'both',
      feeStructureType: 'fixed',
    };
    stripEmptyEnums(obj);

    expect(obj.feeModel).toBe('fee');
    expect(obj.tenantFindOrFullManagement).toBe('both');
    expect(obj.feeStructureType).toBe('fixed');
  });

  it('leaves null/undefined values untouched', () => {
    const obj = { feeModel: null, tenantFindOrFullManagement: undefined };
    stripEmptyEnums(obj);

    expect(obj.feeModel).toBeNull();
    expect(obj.tenantFindOrFullManagement).toBeUndefined();
  });

  it('handles missing nested objects gracefully', () => {
    const obj = { feeModel: '' };
    // No serviceCapabilities, commercial, integration — should not throw
    expect(() => stripEmptyEnums(obj)).not.toThrow();
    expect(obj.feeModel).toBeUndefined();
  });

  it('Vendor model file contains the pre-validate hook', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('models/Vendor.js', 'utf8');
    expect(content).toContain("pre('validate'");
    expect(content).toContain('OPTIONAL_ENUM_FIELDS');
    expect(content).toContain("=== ''");
    expect(content).toContain('feeModel');
    expect(content).toContain('tenantFindOrFullManagement');
    expect(content).toContain('feeStructureType');
    expect(content).toContain('leaseVsPurchase');
  });
});
