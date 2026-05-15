import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_ID = new mongoose.Types.ObjectId();

const VENDOR_DOC = {
  _id: VENDOR_ID,
  company: 'Llewellyn & Hughes Solicitors',
  slug: 'llewellyn-hughes-solicitors',
  vendorType: 'solicitor',
  location: { city: 'Cardiff', postcode: 'CF10 3DP' },
  contactInfo: { phone: '029 2034 5678', website: 'https://www.llewellyn-hughes.co.uk' },
  practiceAreas: ['Conveyancing', 'Wills & Probate'],
  sraNumber: '654321',
  services: [],
  businessProfile: { description: 'Cardiff solicitors since 2005.' },
};

const mockVendorFindById = vi.fn();
const mockFirmFactsFindOne = vi.fn();

vi.mock('../../models/Vendor.js', () => ({
  default: {
    findById: (...args) => mockVendorFindById(...args),
  },
}));

vi.mock('../../models/FirmFacts.js', () => ({
  default: {
    findOne: (...args) => mockFirmFactsFindOne(...args),
  },
  isFilled: (f) => {
    if (!f || f.value === null || f.value === undefined) return false;
    if (typeof f.value === 'string' && f.value.trim() === '') return false;
    return true;
  },
}));

const { getFirmContext, renderFirmContextBlock } = await import('../../services/contentPlanner/firmContext.js');

function mockVendor(doc = VENDOR_DOC) {
  mockVendorFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) });
}

function mockFirmFacts(doc) {
  mockFirmFactsFindOne.mockReturnValue({ lean: vi.fn().mockReturnValue({ catch: vi.fn().mockResolvedValue(doc) }) });
}

describe('getFirmContext — FirmFacts integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Vendor-only context when no FirmFacts row exists', async () => {
    mockVendor();
    mockFirmFacts(null);

    const ctx = await getFirmContext(VENDOR_ID);

    expect(ctx.company).toBe('Llewellyn & Hughes Solicitors');
    expect(ctx.vendorType).toBe('solicitor');
    expect(ctx.location.city).toBe('Cardiff');
    expect(ctx.firmFactsCompleteness).toBe(0);
    expect(ctx.firmFacts).toBeUndefined();
  });

  it('returns Vendor context + firmFactsCompleteness: 0 for empty FirmFacts', async () => {
    mockVendor();
    mockFirmFacts({
      vendorId: VENDOR_ID,
      completionPercentage: 0,
      identity: {
        firmName: { value: null, filledAt: null, source: null },
        city: { value: null, filledAt: null, source: null },
        vendorType: { value: null, filledAt: null, source: null },
        primarySpecialism: { value: null, filledAt: null, source: null },
        yearEstablished: { value: null, filledAt: null, source: null },
      },
      stage1: {
        regulatoryNumber: { value: null, filledAt: null, source: null },
        transactionCountLastYear: { value: null, filledAt: null, source: null },
        typicalAllInCost: { value: null, filledAt: null, source: null },
      },
    });

    const ctx = await getFirmContext(VENDOR_ID);

    expect(ctx.firmFactsCompleteness).toBe(0);
    expect(ctx.company).toBe('Llewellyn & Hughes Solicitors');
    expect(ctx.firmFacts).toBeUndefined();
  });

  it('merges partial FirmFacts into context', async () => {
    mockVendor();
    mockFirmFacts({
      vendorId: VENDOR_ID,
      completionPercentage: 45,
      identity: {
        firmName: { value: 'Llewellyn & Hughes Solicitors', filledAt: new Date(), source: 'self' },
        city: { value: 'Cardiff', filledAt: new Date(), source: 'self' },
        vendorType: { value: 'solicitor', filledAt: new Date(), source: 'self' },
        primarySpecialism: { value: 'Conveyancing', filledAt: new Date(), source: 'self' },
        yearEstablished: { value: 2005, filledAt: new Date(), source: 'self' },
      },
      stage1: {
        regulatoryNumber: { value: '654321', filledAt: new Date(), source: 'verified_register' },
        transactionCountLastYear: { value: 247, filledAt: new Date(), source: 'self' },
        typicalAllInCost: { value: '£850–£1,500', filledAt: new Date(), source: 'self' },
      },
      stage2: {
        formalComplaintsThisYear: { value: 2, filledAt: new Date(), source: 'self' },
        complaintResolutionDays: { value: 8, filledAt: new Date(), source: 'self' },
        averageCompletionTimeWeeks: { value: null, filledAt: null, source: null },
        specialismCaseCount: { value: null, filledAt: null, source: null },
        teamCombinedYears: { value: null, filledAt: null, source: null },
      },
    });

    const ctx = await getFirmContext(VENDOR_ID);

    expect(ctx.firmFactsCompleteness).toBe(45);
    expect(ctx.regulatoryNumbers.sra).toBe('654321');
    expect(ctx.businessProfile.yearsInBusiness).toBe(new Date().getFullYear() - 2005);
    expect(ctx.firmFacts).toBeDefined();
    expect(ctx.firmFacts.transactionCountLastYear).toBe(247);
    expect(ctx.firmFacts.typicalAllInCost).toBe('£850–£1,500');
    expect(ctx.firmFacts.formalComplaintsThisYear).toBe(2);
    expect(ctx.firmFacts.complaintResolutionDays).toBe(8);
    expect(ctx.firmFacts.averageCompletionTimeWeeks).toBeUndefined();
  });

  it('merges full FirmFacts (100%) into context with all fields', async () => {
    mockVendor();
    mockFirmFacts({
      vendorId: VENDOR_ID,
      completionPercentage: 100,
      identity: {
        firmName: { value: 'Llewellyn & Hughes Solicitors', filledAt: new Date(), source: 'self' },
        city: { value: 'Cardiff', filledAt: new Date(), source: 'self' },
        vendorType: { value: 'solicitor', filledAt: new Date(), source: 'self' },
        primarySpecialism: { value: 'Conveyancing', filledAt: new Date(), source: 'self' },
        yearEstablished: { value: 2005, filledAt: new Date(), source: 'self' },
      },
      stage1: {
        regulatoryNumber: { value: '654321', filledAt: new Date(), source: 'verified_register' },
        transactionCountLastYear: { value: 247, filledAt: new Date(), source: 'self' },
        typicalAllInCost: { value: '£850–£1,500', filledAt: new Date(), source: 'self' },
      },
      stage2: {
        formalComplaintsThisYear: { value: 2, filledAt: new Date(), source: 'self' },
        complaintResolutionDays: { value: 8, filledAt: new Date(), source: 'self' },
        averageCompletionTimeWeeks: { value: 10, filledAt: new Date(), source: 'self' },
        specialismCaseCount: { value: 1200, filledAt: new Date(), source: 'self' },
        teamCombinedYears: { value: 85, filledAt: new Date(), source: 'self' },
        averageDisbursements: { value: '£350', filledAt: new Date(), source: 'self' },
        fixedFeeSavingVsHourly: { value: '£320', filledAt: new Date(), source: 'self' },
      },
    });

    const ctx = await getFirmContext(VENDOR_ID);

    expect(ctx.firmFactsCompleteness).toBe(100);
    expect(ctx.firmFacts.transactionCountLastYear).toBe(247);
    expect(ctx.firmFacts.specialismCaseCount).toBe(1200);
    expect(ctx.firmFacts.teamCombinedYears).toBe(85);
    expect(ctx.firmFacts.averageDisbursements).toBe('£350');
    expect(ctx.firmFacts.fixedFeeSavingVsHourly).toBe('£320');
  });

  it('FirmFacts values override Vendor values where both exist', async () => {
    mockVendor({ ...VENDOR_DOC, company: 'Old Name LLP' });
    mockFirmFacts({
      vendorId: VENDOR_ID,
      completionPercentage: 20,
      identity: {
        firmName: { value: 'New Name Solicitors', filledAt: new Date(), source: 'self' },
        city: { value: 'Newport', filledAt: new Date(), source: 'self' },
        vendorType: { value: null, filledAt: null, source: null },
        primarySpecialism: { value: null, filledAt: null, source: null },
        yearEstablished: { value: null, filledAt: null, source: null },
      },
    });

    const ctx = await getFirmContext(VENDOR_ID);

    expect(ctx.company).toBe('New Name Solicitors');
    expect(ctx.location.city).toBe('Newport');
  });

  it('surfaces brandIdentity fields separately from firmFacts', async () => {
    mockVendor();
    mockFirmFacts({
      vendorId: VENDOR_ID,
      completionPercentage: 60,
      stage2: {
        toneOfVoice: { value: 'approachable', filledAt: new Date(), source: 'self' },
        brandKeywords: { value: ['transparent', 'local', 'expert'], filledAt: new Date(), source: 'self' },
        uniqueSellingPoints: { value: ['Fixed fees', 'Same-day response'], filledAt: new Date(), source: 'self' },
        clientTypes: { value: ['First-time buyers', 'Investors'], filledAt: new Date(), source: 'self' },
        formalComplaintsThisYear: { value: 1, filledAt: new Date(), source: 'self' },
      },
      brandIdentity: {
        awards: { value: ['Law Society Excellence 2025'], filledAt: new Date(), source: 'self' },
        competitors: { value: ['Morgan Cole', 'Hugh James'], filledAt: new Date(), source: 'self' },
        feeEarnerCount: { value: null, filledAt: null, source: null },
      },
    });

    const ctx = await getFirmContext(VENDOR_ID);

    expect(ctx.brandIdentity).toBeDefined();
    expect(ctx.brandIdentity.toneOfVoice).toBe('approachable');
    expect(ctx.brandIdentity.brandKeywords).toEqual(['transparent', 'local', 'expert']);
    expect(ctx.brandIdentity.uniqueSellingPoints).toEqual(['Fixed fees', 'Same-day response']);
    expect(ctx.brandIdentity.clientTypes).toEqual(['First-time buyers', 'Investors']);
    expect(ctx.brandIdentity.awards).toEqual(['Law Society Excellence 2025']);
    expect(ctx.brandIdentity.competitors).toEqual(['Morgan Cole', 'Hugh James']);
    expect(ctx.brandIdentity.feeEarnerCount).toBeUndefined();
    expect(ctx.firmFacts.formalComplaintsThisYear).toBe(1);
    expect(ctx.firmFacts.toneOfVoice).toBeUndefined();
  });

  it('omits brandIdentity section when no brand fields filled', async () => {
    mockVendor();
    mockFirmFacts({
      vendorId: VENDOR_ID,
      completionPercentage: 20,
      stage1: {
        regulatoryNumber: { value: '654321', filledAt: new Date(), source: 'verified_register' },
        transactionCountLastYear: { value: null, filledAt: null, source: null },
        typicalAllInCost: { value: null, filledAt: null, source: null },
      },
    });

    const ctx = await getFirmContext(VENDOR_ID);

    expect(ctx.brandIdentity).toBeUndefined();
  });

  it('throws when Vendor not found (regardless of FirmFacts)', async () => {
    mockVendorFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockFirmFacts({ vendorId: VENDOR_ID, completionPercentage: 50 });

    await expect(getFirmContext(VENDOR_ID)).rejects.toThrow('Vendor');
  });
});

describe('renderFirmContextBlock — adaptive guidance by completeness threshold', () => {
  const LOW_GUIDANCE = 'This firm has filled in very little of its data. Use [FIRM TO PROVIDE: ...] markers throughout. Only use the basic identity fields (company, city, specialism, vendorType) without markers.';
  const MID_GUIDANCE = 'This firm has filled in some of its data. Use verified numbers where present in firm_context. Use [FIRM TO PROVIDE: ...] markers liberally for the rest.';
  const HIGH_GUIDANCE = 'This firm has filled in most of its data. Prefer the verified numbers in firm_context. Only use [FIRM TO PROVIDE: ...] markers for facts not present in this block.';

  it('places the data_completeness tag after the JSON payload, inside <firm_context>', () => {
    const block = renderFirmContextBlock({ company: 'Test', firmFactsCompleteness: 50 });
    const jsonIdx = block.indexOf('"company": "Test"');
    const completenessIdx = block.indexOf('<data_completeness>');
    const closingIdx = block.indexOf('</firm_context>');
    expect(jsonIdx).toBeGreaterThan(0);
    expect(completenessIdx).toBeGreaterThan(jsonIdx);
    expect(closingIdx).toBeGreaterThan(completenessIdx);
  });

  it('0% completeness → low-data guidance ("markers throughout")', () => {
    const block = renderFirmContextBlock({ company: 'Test', firmFactsCompleteness: 0 });
    expect(block).toContain('0% of firm data fields are filled.');
    expect(block).toContain(LOW_GUIDANCE);
    expect(block).not.toContain(MID_GUIDANCE);
    expect(block).not.toContain(HIGH_GUIDANCE);
  });

  it('22% completeness → low-data guidance ("markers throughout")', () => {
    const block = renderFirmContextBlock({ company: 'Test', firmFactsCompleteness: 22 });
    expect(block).toContain('22% of firm data fields are filled.');
    expect(block).toContain(LOW_GUIDANCE);
    expect(block).not.toContain(MID_GUIDANCE);
    expect(block).not.toContain(HIGH_GUIDANCE);
  });

  it('50% completeness → mid-data guidance ("markers liberally")', () => {
    const block = renderFirmContextBlock({ company: 'Test', firmFactsCompleteness: 50 });
    expect(block).toContain('50% of firm data fields are filled.');
    expect(block).toContain(MID_GUIDANCE);
    expect(block).not.toContain(LOW_GUIDANCE);
    expect(block).not.toContain(HIGH_GUIDANCE);
  });

  it('80% completeness → high-data guidance ("prefer verified numbers")', () => {
    const block = renderFirmContextBlock({ company: 'Test', firmFactsCompleteness: 80 });
    expect(block).toContain('80% of firm data fields are filled.');
    expect(block).toContain(HIGH_GUIDANCE);
    expect(block).not.toContain(LOW_GUIDANCE);
    expect(block).not.toContain(MID_GUIDANCE);
  });

  it('100% completeness → high-data guidance ("prefer verified numbers")', () => {
    const block = renderFirmContextBlock({ company: 'Test', firmFactsCompleteness: 100 });
    expect(block).toContain('100% of firm data fields are filled.');
    expect(block).toContain(HIGH_GUIDANCE);
    expect(block).not.toContain(LOW_GUIDANCE);
    expect(block).not.toContain(MID_GUIDANCE);
  });

  it('defaults to 0% (low-data guidance) when firmFactsCompleteness is undefined', () => {
    const block = renderFirmContextBlock({ company: 'Test' });
    expect(block).toContain('0% of firm data fields are filled.');
    expect(block).toContain(LOW_GUIDANCE);
  });

  it('includes <brand_identity> section when brandIdentity is present', () => {
    const block = renderFirmContextBlock({
      company: 'Test',
      firmFactsCompleteness: 60,
      brandIdentity: {
        toneOfVoice: 'approachable',
        brandKeywords: ['transparent', 'local'],
        uniqueSellingPoints: ['Fixed fees', 'Same-day response'],
        clientTypes: ['SMEs', 'Sole Traders'],
      },
    });
    expect(block).toContain('<brand_identity>');
    expect(block).toContain('Tone: approachable');
    expect(block).toContain('transparent, local');
    expect(block).toContain('Fixed fees; Same-day response');
    expect(block).toContain('SMEs, Sole Traders');
    expect(block).toContain('</brand_identity>');
  });

  it('omits <brand_identity> section when brandIdentity is absent', () => {
    const block = renderFirmContextBlock({ company: 'Test', firmFactsCompleteness: 20 });
    expect(block).not.toContain('<brand_identity>');
  });
});
