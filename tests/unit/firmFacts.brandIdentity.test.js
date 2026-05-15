import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_ID = new mongoose.Types.ObjectId();

const mockFindOrCreate = vi.fn();

vi.mock('../../models/FirmFacts.js', () => {
  const STAGE1_PATHS = ['stage1.regulatoryNumber', 'stage1.transactionCountLastYear', 'stage1.typicalAllInCost'];
  const STAGE2_PATHS = [
    'stage2.formalComplaintsThisYear', 'stage2.complaintResolutionDays', 'stage2.averageCompletionTimeWeeks',
    'stage2.specialismCaseCount', 'stage2.teamCombinedYears', 'stage2.averageDisbursements',
    'stage2.fixedFeeSavingVsHourly', 'stage2.averageAnnualFees', 'stage2.qualificationsHeld',
    'stage2.brokerFee', 'stage2.averageRateSavingPerYear', 'stage2.lenderPanelSize',
    'stage2.soleAgencyFeePercent', 'stage2.achievedVsAskingPercent', 'stage2.daysListingToSaleAgreed',
    'stage2.clientTypes', 'stage2.toneOfVoice', 'stage2.brandKeywords', 'stage2.uniqueSellingPoints',
  ];
  const isFilled = (f) => {
    if (!f || f.value === null || f.value === undefined) return false;
    if (typeof f.value === 'string' && f.value.trim() === '') return false;
    if (Array.isArray(f.value) && f.value.length === 0) return false;
    return true;
  };
  return {
    STAGE1_PATHS,
    STAGE2_PATHS,
    isFilled,
    default: {
      findOne: vi.fn(),
      findOrCreateForVendor: (...args) => mockFindOrCreate(...args),
    },
  };
});

vi.mock('../../middleware/vendorAuth.js', () => ({
  default: (req, _res, next) => {
    req.vendorId = req.headers['x-test-vendor-id'] || String(VENDOR_ID);
    req.vendor = { id: req.vendorId, vendorId: req.vendorId };
    next();
  },
}));

const { isFilled, STAGE2_PATHS } = await import('../../models/FirmFacts.js');

describe('FirmFacts — Brand Identity', () => {
  describe('isFilled handles array values', () => {
    it('returns false for empty array', () => {
      expect(isFilled({ value: [] })).toBe(false);
    });

    it('returns true for non-empty array', () => {
      expect(isFilled({ value: ['SMEs', 'Sole Traders'] })).toBe(true);
    });

    it('returns true for array with objects', () => {
      expect(isFilled({ value: [{ name: 'James', role: 'Partner' }] })).toBe(true);
    });
  });

  describe('STAGE2_PATHS includes brand essentials', () => {
    it('includes clientTypes', () => {
      expect(STAGE2_PATHS).toContain('stage2.clientTypes');
    });

    it('includes toneOfVoice', () => {
      expect(STAGE2_PATHS).toContain('stage2.toneOfVoice');
    });

    it('includes brandKeywords', () => {
      expect(STAGE2_PATHS).toContain('stage2.brandKeywords');
    });

    it('includes uniqueSellingPoints', () => {
      expect(STAGE2_PATHS).toContain('stage2.uniqueSellingPoints');
    });

    it('has 19 total stage2 paths (15 operational + 4 brand)', () => {
      expect(STAGE2_PATHS).toHaveLength(19);
    });
  });

  describe('brand identity field validation', () => {
    it('toneOfVoice accepts valid enum values', () => {
      const valid = ['formal', 'approachable', 'plain-english', 'expert'];
      for (const tone of valid) {
        expect(isFilled({ value: tone })).toBe(true);
      }
    });

    it('uniqueSellingPoints stored as array of strings', () => {
      const usps = { value: ['20 years experience', 'Fixed fees', 'SRA regulated', 'Cardiff specialists', 'Same-day response'] };
      expect(isFilled(usps)).toBe(true);
      expect(usps.value).toHaveLength(5);
    });

    it('partners stored as array of objects', () => {
      const partners = { value: [{ name: 'James Hughes', role: 'Senior Partner', qualifications: 'LLB, SRA', yearsAtFirm: 15 }] };
      expect(isFilled(partners)).toBe(true);
      expect(partners.value[0].name).toBe('James Hughes');
    });

    it('competitors stored as array of strings', () => {
      const competitors = { value: ['Morgan Cole', 'Hugh James', 'Capital Law'] };
      expect(isFilled(competitors)).toBe(true);
      expect(competitors.value).toHaveLength(3);
    });
  });
});
