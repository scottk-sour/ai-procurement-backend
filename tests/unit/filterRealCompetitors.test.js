import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const SOLICITOR_VENDORS = [
  { _id: new mongoose.Types.ObjectId(), company: 'Hugh James Solicitors LLP' },
  { _id: new mongoose.Types.ObjectId(), company: 'Berry Smith LLP' },
  { _id: new mongoose.Types.ObjectId(), company: 'Capital Law' },
  { _id: new mongoose.Types.ObjectId(), company: 'Howells Solicitors' },
  { _id: new mongoose.Types.ObjectId(), company: 'JCP Solicitors' },
];

vi.mock('../../models/Vendor.js', () => ({
  default: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(SOLICITOR_VENDORS),
      }),
    }),
  },
}));

const { filterRealCompetitors, clearCategoryCache } = await import('../../services/reporter/filterRealCompetitors.js');

describe('filterRealCompetitors', () => {
  beforeEach(() => {
    clearCategoryCache();
  });

  it('keeps known-real firm names and drops noise', async () => {
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

    const result = await filterRealCompetitors(raw, { category: 'solicitor' });

    const names = result.map(r => r.name);
    expect(names).toContain('Hugh James Solicitors LLP');
    expect(names).toContain('Capital Law');
    expect(names).toContain('JCP Solicitors');
    expect(names).not.toContain('Back');
    expect(names).not.toContain('Practice resources');
    expect(names).not.toContain('I recommend');
    expect(names).not.toContain('Comparing costs and availability');
    expect(names).not.toContain('Verifying SRA registration');
  });

  it('preserves input order (AI ranking)', async () => {
    const raw = ['JCP Solicitors', 'Capital Law', 'Hugh James Solicitors LLP'];
    const result = await filterRealCompetitors(raw, { category: 'solicitor' });

    expect(result[0].name).toBe('JCP Solicitors');
    expect(result[1].name).toBe('Capital Law');
    expect(result[2].name).toBe('Hugh James Solicitors LLP');
  });

  it('handles suffix variation: "Hugh James" matches "Hugh James Solicitors LLP"', async () => {
    const raw = ['Hugh James'];
    const result = await filterRealCompetitors(raw, { category: 'solicitor' });

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Hugh James Solicitors LLP');
    expect(result[0].raw).toBe('Hugh James');
  });

  it('returns empty array for all-noise input', async () => {
    const raw = ['Back', 'I recommend', 'Run and grow your practice', 'Get multiple quotes'];
    const result = await filterRealCompetitors(raw, { category: 'solicitor' });
    expect(result).toEqual([]);
  });

  it('returns empty array for empty input', async () => {
    const result = await filterRealCompetitors([], { category: 'solicitor' });
    expect(result).toEqual([]);
  });

  it('deduplicates when same firm appears with different casing/suffix', async () => {
    const raw = ['Hugh James Solicitors LLP', 'Hugh James', 'HUGH JAMES SOLICITORS'];
    const result = await filterRealCompetitors(raw, { category: 'solicitor' });
    expect(result.length).toBe(1);
  });
});
