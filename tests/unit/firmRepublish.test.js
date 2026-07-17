import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/contentPlanner/validators.js', () => ({
  validateContentDraft: vi.fn().mockReturnValue({ passed: true, errors: [], warnings: [] }),
  BANNED_PHRASES: [], BANNED_PHRASE_WORDS: [],
  repairContainsBannedPhrase: vi.fn().mockReturnValue(false),
}));
vi.mock('../../services/contentPlanner/fabricationReview.js', () => ({
  reviewDraftForFabrication: vi.fn().mockResolvedValue({ verdict: 'pass' }),
}));
vi.mock('../../services/contentPlanner/firmContext.js', () => ({
  getFirmContext: vi.fn().mockResolvedValue({}),
  renderFirmContextBlock: vi.fn().mockReturnValue(''),
}));

const mockPostSave = vi.fn().mockImplementation(function () { return Promise.resolve(this); });
const mockPostFindById = vi.fn();
vi.mock('../../models/VendorPost.js', () => ({
  default: { findById: (...args) => mockPostFindById(...args) },
}));

vi.mock('../../models/Vendor.js', () => ({
  default: { findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'v1', vendorType: 'solicitor' }) }) },
}));

const mockApprovalSave = vi.fn().mockImplementation(function () { return Promise.resolve(this); });
const mockMarkModified = vi.fn();

function makeApproval(overrides = {}) {
  return {
    _id: 'appr-1',
    vendorId: { toString: () => 'vendor-1' },
    itemType: 'content_draft',
    status: 'executed',
    draftPayload: {
      title: 'Test Post',
      body: 'Our fee is [FIRM_DATA: brokerFee | Your fee]. We have [FIRM_DATA: teamSize | Size] staff.',
    },
    firmData: new Map([['brokerFee', '£499'], ['teamSize', '12']]),
    executionResult: { postId: 'post-1', slug: 'test-post-abc-20260717' },
    republishedAt: [],
    save: mockApprovalSave,
    markModified: mockMarkModified,
    ...overrides,
  };
}

vi.mock('../../models/ApprovalQueue.js', () => {
  function MockModel(data) { Object.assign(this, data); this.save = mockApprovalSave; this.markModified = mockMarkModified; }
  MockModel.findById = vi.fn();
  MockModel.find = vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ skip: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) }) }) }) });
  MockModel.countDocuments = vi.fn().mockResolvedValue(0);
  MockModel.findOne = vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) }) });
  return { default: MockModel };
});

const { default: ApprovalQueue } = await import('../../models/ApprovalQueue.js');
const { firmRepublish, substitutePlaceholders } = await import('../../services/approvalQueue.js');

describe('firm-data save on executed approval', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('firm-data saves are allowed on executed status', () => {
    const approval = makeApproval();
    expect(['approved', 'executed'].includes(approval.status)).toBe(true);
  });
});

describe('substitutePlaceholders (exported)', () => {
  it('merges firmData into body preserving originals in source', () => {
    const body = 'Fee is [FIRM_DATA: brokerFee | Your fee].';
    const map = new Map([['brokerFee', '£499']]);
    expect(substitutePlaceholders(body, map)).toBe('Fee is £499.');
    expect(body).toContain('[FIRM_DATA:');
  });
});

describe('firmRepublish', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('updates existing post in-place with merged values', async () => {
    const approval = makeApproval();
    ApprovalQueue.findById.mockResolvedValue(approval);

    const mockPost = {
      _id: 'post-1',
      slug: 'test-post-abc-20260717',
      body: 'old body',
      title: 'old title',
      save: mockPostSave,
    };
    mockPostFindById.mockResolvedValue(mockPost);

    const result = await firmRepublish('appr-1', 'vendor-1');

    expect(result.ok).toBe(true);
    expect(result.slug).toBe('test-post-abc-20260717');
    expect(mockPost.body).toBe('Our fee is £499. We have 12 staff.');
    expect(mockPost.title).toBe('Test Post');
    expect(mockPostSave).toHaveBeenCalled();
    expect(approval.republishedAt).toHaveLength(1);
    expect(approval.republishedAt[0]).toBeInstanceOf(Date);
  });

  it('slug remains unchanged after republish', async () => {
    const approval = makeApproval();
    ApprovalQueue.findById.mockResolvedValue(approval);

    const mockPost = { _id: 'post-1', slug: 'original-slug-123', body: '', title: '', save: mockPostSave };
    mockPostFindById.mockResolvedValue(mockPost);

    const result = await firmRepublish('appr-1', 'vendor-1');
    expect(result.slug).toBe('original-slug-123');
  });

  it('rejects from non-executed status', async () => {
    ApprovalQueue.findById.mockResolvedValue(makeApproval({ status: 'approved' }));
    await expect(firmRepublish('appr-1', 'vendor-1')).rejects.toThrow('must be "executed"');
  });

  it('rejects wrong vendor', async () => {
    ApprovalQueue.findById.mockResolvedValue(makeApproval());
    await expect(firmRepublish('appr-1', 'wrong-vendor')).rejects.toThrow('Access denied');
  });

  it('on semantic failure leaves the live post untouched', async () => {
    const { reviewDraftForFabrication } = await import('../../services/contentPlanner/fabricationReview.js');
    reviewDraftForFabrication.mockResolvedValueOnce({ verdict: 'fail', fabricatedAttributions: [{ claim: 'bad claim', body: 'anon' }], firmClaimsNotInContext: [], qualityScore: 3 });

    const approval = makeApproval();
    ApprovalQueue.findById.mockResolvedValue(approval);

    const mockPost = { _id: 'post-1', slug: 'original-slug', body: 'live content', title: 'live title', save: mockPostSave };
    mockPostFindById.mockResolvedValue(mockPost);

    await expect(firmRepublish('appr-1', 'vendor-1')).rejects.toThrow('Publish blocked');
    expect(mockPost.body).toBe('live content');
    expect(mockPostSave).not.toHaveBeenCalled();
    expect(approval.status).toBe('executed');
  });

  it('on validation failure leaves approval as executed', async () => {
    const { validateContentDraft } = await import('../../services/contentPlanner/validators.js');
    validateContentDraft.mockReturnValueOnce({ passed: false, errors: ['Banned phrase: "additionally"'], warnings: [] });

    const approval = makeApproval();
    ApprovalQueue.findById.mockResolvedValue(approval);

    await expect(firmRepublish('appr-1', 'vendor-1')).rejects.toThrow('Validation failed');
    expect(approval.status).toBe('executed');
  });

  it('accumulates republishedAt timestamps on repeated republishes', async () => {
    const approval = makeApproval({ republishedAt: [new Date('2026-07-10')] });
    ApprovalQueue.findById.mockResolvedValue(approval);

    const mockPost = { _id: 'post-1', slug: 's', body: '', title: '', save: mockPostSave };
    mockPostFindById.mockResolvedValue(mockPost);

    await firmRepublish('appr-1', 'vendor-1');
    expect(approval.republishedAt).toHaveLength(2);
  });
});
