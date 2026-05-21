import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const SOLICITOR_VENDORS = [
  { _id: new mongoose.Types.ObjectId(), company: 'Hugh James Solicitors LLP' },
  { _id: new mongoose.Types.ObjectId(), company: 'Berry Smith LLP' },
  { _id: new mongoose.Types.ObjectId(), company: 'Capital Law' },
  { _id: new mongoose.Types.ObjectId(), company: 'Howells Solicitors' },
  { _id: new mongoose.Types.ObjectId(), company: 'JCP Solicitors' },
];

const ACCOUNTANT_VENDORS = [
  { _id: new mongoose.Types.ObjectId(), company: 'Azets Holdings Ltd' },
  { _id: new mongoose.Types.ObjectId(), company: 'Kilsby Williams' },
];

const mockVendorFind = vi.fn();

vi.mock('../../models/Vendor.js', () => ({
  default: {
    find: (...args) => mockVendorFind(...args),
  },
}));

const { filterRealCompetitors, clearCategoryCache, resolveVendorType } = await import('../../services/reporter/filterRealCompetitors.js');

function mockVendorPool(vendors) {
  mockVendorFind.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(vendors),
    }),
  });
}

describe('resolveVendorType', () => {
  it('maps solicitor practice areas to "solicitor"', () => {
    expect(resolveVendorType('Conveyancing')).toBe('solicitor');
    expect(resolveVendorType('Family Law')).toBe('solicitor');
    expect(resolveVendorType('Criminal Law')).toBe('solicitor');
    expect(resolveVendorType('Wills & Probate')).toBe('solicitor');
    expect(resolveVendorType('Solicitors')).toBe('solicitor');
    expect(resolveVendorType('solicitor')).toBe('solicitor');
    expect(resolveVendorType('Immigration')).toBe('solicitor');
    expect(resolveVendorType('Personal Injury')).toBe('solicitor');
    expect(resolveVendorType('IP & Technology')).toBe('solicitor');
  });

  it('maps other verticals correctly', () => {
    expect(resolveVendorType('Accountants')).toBe('accountant');
    expect(resolveVendorType('Estate Agents')).toBe('estate-agent');
    expect(resolveVendorType('Mortgage Advisors')).toBe('mortgage-advisor');
    expect(resolveVendorType('Financial Services')).toBe('financial-advisor');
    expect(resolveVendorType('IT')).toBe('office-equipment');
    expect(resolveVendorType('Photocopiers')).toBe('office-equipment');
    expect(resolveVendorType('Telecoms')).toBe('office-equipment');
    expect(resolveVendorType('Software')).toBe('office-equipment');
    expect(resolveVendorType('Security')).toBe('office-equipment');
  });

  it('is case-insensitive', () => {
    expect(resolveVendorType('CONVEYANCING')).toBe('solicitor');
    expect(resolveVendorType('accountants')).toBe('accountant');
    expect(resolveVendorType('  Estate Agents  ')).toBe('estate-agent');
  });

  it('returns null and warns for unmapped category', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveVendorType('Underwater Basket Weaving')).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unmapped category'));
    spy.mockRestore();
  });

  it('returns null for null/empty', () => {
    expect(resolveVendorType(null)).toBeNull();
    expect(resolveVendorType('')).toBeNull();
  });
});

describe('filterRealCompetitors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCategoryCache();
  });

  it('keeps known-real solicitor firms and drops noise via "Conveyancing" category', async () => {
    mockVendorPool(SOLICITOR_VENDORS);

    const raw = [
      'Hugh James Solicitors LLP',
      'Back',
      'Practice resources',
      'I recommend',
      'Capital Law',
      'Comparing costs and availability',
      'Run and grow your practice',
      'JCP Solicitors',
      'Verifying SRA registration',
    ];

    const result = await filterRealCompetitors(raw, { category: 'Conveyancing' });

    expect(mockVendorFind).toHaveBeenCalledWith({ vendorType: 'solicitor' });

    const names = result.map(r => r.name);
    expect(names).toContain('Hugh James Solicitors LLP');
    expect(names).toContain('Capital Law');
    expect(names).toContain('JCP Solicitors');
    expect(names).not.toContain('Back');
    expect(names).not.toContain('Practice resources');
    expect(names).not.toContain('I recommend');
    expect(names).not.toContain('Comparing costs and availability');
  });

  it('loads accountant pool when category is "Accountants"', async () => {
    mockVendorPool(ACCOUNTANT_VENDORS);

    const raw = ['Azets Holdings Ltd', 'Check references', 'Kilsby Williams'];
    const result = await filterRealCompetitors(raw, { category: 'Accountants' });

    expect(mockVendorFind).toHaveBeenCalledWith({ vendorType: 'accountant' });
    const names = result.map(r => r.name);
    expect(names).toContain('Azets Holdings Ltd');
    expect(names).toContain('Kilsby Williams');
    expect(names).not.toContain('Check references');
  });

  it('preserves input order (AI ranking)', async () => {
    mockVendorPool(SOLICITOR_VENDORS);
    const raw = ['JCP Solicitors', 'Capital Law', 'Hugh James Solicitors LLP'];
    const result = await filterRealCompetitors(raw, { category: 'Family Law' });

    expect(result[0].name).toBe('JCP Solicitors');
    expect(result[1].name).toBe('Capital Law');
    expect(result[2].name).toBe('Hugh James Solicitors LLP');
  });

  it('handles suffix variation: "Hugh James" matches "Hugh James Solicitors LLP"', async () => {
    mockVendorPool(SOLICITOR_VENDORS);
    const raw = ['Hugh James'];
    const result = await filterRealCompetitors(raw, { category: 'Solicitors' });

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Hugh James Solicitors LLP');
    expect(result[0].raw).toBe('Hugh James');
  });

  it('returns empty array for all-noise input', async () => {
    mockVendorPool(SOLICITOR_VENDORS);
    const raw = ['Back', 'I recommend', 'Run and grow your practice', 'Get multiple quotes'];
    const result = await filterRealCompetitors(raw, { category: 'solicitor' });
    expect(result).toEqual([]);
  });

  it('returns empty for unmapped category (with warning)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockVendorPool([]);
    const raw = ['Some Firm'];
    const result = await filterRealCompetitors(raw, { category: 'Unknown Category' });
    expect(result).toEqual([]);
    spy.mockRestore();
  });

  it('deduplicates same firm with different casing/suffix', async () => {
    mockVendorPool(SOLICITOR_VENDORS);
    const raw = ['Hugh James Solicitors LLP', 'Hugh James', 'HUGH JAMES SOLICITORS'];
    const result = await filterRealCompetitors(raw, { category: 'Criminal Law' });
    expect(result.length).toBe(1);
  });

  it('caches by resolved vendorType — two practice areas share one pool', async () => {
    mockVendorPool(SOLICITOR_VENDORS);

    await filterRealCompetitors(['Capital Law'], { category: 'Conveyancing' });
    await filterRealCompetitors(['Capital Law'], { category: 'Family Law' });

    expect(mockVendorFind).toHaveBeenCalledTimes(1);
  });
});
