import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSave = vi.fn().mockImplementation(function () { return Promise.resolve(this); });
const mockMarkModified = vi.fn();

function makeMockItem(overrides = {}) {
  return {
    _id: 'approval-1',
    vendorId: { toString: () => 'vendor-1' },
    agentName: 'writer',
    itemType: 'content_draft',
    status: 'pending',
    draftPayload: { title: 'Test', body: 'Body' },
    metadata: {},
    save: mockSave,
    markModified: mockMarkModified,
    ...overrides,
  };
}

vi.mock('../../services/contentPlanner/validators.js', () => ({
  validateContentDraft: vi.fn().mockReturnValue({ passed: true, errors: [], warnings: [] }),
}));
vi.mock('../../services/contentPlanner/fabricationReview.js', () => ({
  reviewDraftForFabrication: vi.fn().mockResolvedValue({ verdict: 'pass' }),
}));
vi.mock('../../services/contentPlanner/firmContext.js', () => ({
  getFirmContext: vi.fn().mockResolvedValue({}),
  renderFirmContextBlock: vi.fn().mockReturnValue(''),
}));

vi.mock('../../models/ApprovalQueue.js', () => {
  function MockModel(data) {
    Object.assign(this, data);
    this._id = 'mock-id-123';
    this.save = mockSave;
  }
  MockModel.findById = vi.fn();
  MockModel.find = vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnValue({
      skip: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }),
  });
  MockModel.countDocuments = vi.fn().mockResolvedValue(0);
  MockModel.findOne = vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    }),
  });
  return { default: MockModel };
});

const { default: ApprovalQueue } = await import('../../models/ApprovalQueue.js');
const {
  approveItem,
  rejectItem,
  firmApproveAndExecute,
  firmRejectItem,
  executeApprovedItem,
} = await import('../../services/approvalQueue.js');

describe('Sequential workflow transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockImplementation(function () { return Promise.resolve(this); });
  });

  // ── Admin approve ──

  describe('approveItem', () => {
    it('approves from pending', async () => {
      const item = makeMockItem({ status: 'pending' });
      ApprovalQueue.findById.mockResolvedValue(item);
      const result = await approveItem('approval-1', 'admin-1');
      expect(result.status).toBe('approved');
      expect(result.firmRejectionReason).toBeNull();
    });

    it('approves from needs_review', async () => {
      const item = makeMockItem({ status: 'needs_review' });
      ApprovalQueue.findById.mockResolvedValue(item);
      const result = await approveItem('approval-1', 'admin-1');
      expect(result.status).toBe('approved');
    });

    it('clears firm rejection fields on approve', async () => {
      const item = makeMockItem({ status: 'needs_review', firmRejectionReason: 'Wrong tone', firmRejectedAt: new Date() });
      ApprovalQueue.findById.mockResolvedValue(item);
      const result = await approveItem('approval-1', 'admin-1');
      expect(result.firmRejectionReason).toBeNull();
      expect(result.firmRejectedAt).toBeNull();
    });

    it('rejects approve from executed', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'executed' }));
      await expect(approveItem('approval-1', 'admin-1')).rejects.toThrow('Cannot approve');
    });
  });

  // ── Firm reject ──

  describe('firmRejectItem', () => {
    it('rejects approved draft with reason, routes to needs_review', async () => {
      const item = makeMockItem({ status: 'approved' });
      ApprovalQueue.findById.mockResolvedValue(item);
      const result = await firmRejectItem('approval-1', 'vendor-1', 'Wrong tone for our brand');
      expect(result.status).toBe('needs_review');
      expect(result.firmRejectionReason).toBe('Wrong tone for our brand');
      expect(result.firmRejectedAt).toBeInstanceOf(Date);
    });

    it('requires a reason', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'approved' }));
      await expect(firmRejectItem('approval-1', 'vendor-1', '')).rejects.toThrow('required');
      await expect(firmRejectItem('approval-1', 'vendor-1', null)).rejects.toThrow('required');
    });

    it('rejects from non-approved status', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'pending' }));
      await expect(firmRejectItem('approval-1', 'vendor-1', 'reason')).rejects.toThrow('must be approved');
    });

    it('rejects wrong vendor', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'approved' }));
      await expect(firmRejectItem('approval-1', 'other-vendor', 'reason')).rejects.toThrow('Access denied');
    });
  });

  // ── Firm approve and execute ──

  describe('firmApproveAndExecute', () => {
    it('rejects from non-approved status', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'pending' }));
      await expect(firmApproveAndExecute('approval-1', 'vendor-1')).rejects.toThrow('must be approved by admin');
    });

    it('rejects from needs_review', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'needs_review' }));
      await expect(firmApproveAndExecute('approval-1', 'vendor-1')).rejects.toThrow('must be approved by admin');
    });

    it('rejects wrong vendor', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'approved' }));
      await expect(firmApproveAndExecute('approval-1', 'other-vendor')).rejects.toThrow('Access denied');
    });
  });

  // ── Execute accepts firm_completed ──

  describe('executeApprovedItem', () => {
    it('does not reject firm_completed status', async () => {
      const item = makeMockItem({ status: 'firm_completed' });
      ApprovalQueue.findById.mockResolvedValue(item);
      // Will fail downstream (no real VendorPost model) but the status guard passes
      await expect(executeApprovedItem('approval-1')).rejects.not.toThrow('must be');
    });

    it('rejects pending status', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'pending' }));
      await expect(executeApprovedItem('approval-1')).rejects.toThrow('must be "approved" or "firm_completed"');
    });

    it('rejects needs_review status', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'needs_review' }));
      await expect(executeApprovedItem('approval-1')).rejects.toThrow('must be "approved" or "firm_completed"');
    });
  });

  // ── Firm cannot access pre-approval drafts ──

  describe('firm visibility guards', () => {
    it('firmRejectItem blocks on pending', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'pending' }));
      await expect(firmRejectItem('approval-1', 'vendor-1', 'reason')).rejects.toThrow('must be approved');
    });

    it('firmRejectItem blocks on needs_review', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'needs_review' }));
      await expect(firmRejectItem('approval-1', 'vendor-1', 'reason')).rejects.toThrow('must be approved');
    });

    it('firmRejectItem blocks on rejected', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'rejected' }));
      await expect(firmRejectItem('approval-1', 'vendor-1', 'reason')).rejects.toThrow('must be approved');
    });

    it('firmApproveAndExecute blocks on rejected', async () => {
      ApprovalQueue.findById.mockResolvedValue(makeMockItem({ status: 'rejected' }));
      await expect(firmApproveAndExecute('approval-1', 'vendor-1')).rejects.toThrow('must be approved');
    });
  });
});
