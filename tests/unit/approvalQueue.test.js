import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ApprovalQueue model before importing service
const mockSave = vi.fn();
const mockLean = vi.fn();
const mockPopulate2 = vi.fn().mockReturnValue({ lean: mockLean });
const mockPopulate1 = vi.fn().mockReturnValue({ populate: mockPopulate2 });
const mockLimit = vi.fn().mockReturnValue({ populate: mockPopulate1 });
const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
const mockSort = vi.fn().mockReturnValue({ skip: mockSkip });

vi.mock('../../models/ApprovalQueue.js', () => {
  function MockModel(data) {
    Object.assign(this, data);
    this._id = 'mock-id-123';
    this.save = mockSave;
  }
  MockModel.findById = vi.fn();
  MockModel.find = vi.fn().mockReturnValue({ sort: mockSort });
  MockModel.countDocuments = vi.fn();
  MockModel.collection = { getIndexes: vi.fn() };
  return { default: MockModel };
});

const { default: ApprovalQueue } = await import('../../models/ApprovalQueue.js');
const {
  createApproval,
  approveItem,
  rejectItem,
  executeApprovedItem,
  listPending,
  getApprovalById,
} = await import('../../services/approvalQueue.js');

describe('ApprovalQueue Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    vendorId: '665f1a2b3c4d5e6f7a8b9c0d',
    agentName: 'writer',
    itemType: 'content_draft',
    title: 'Blog post: Conveyancing in Cardiff 2026',
    draftPayload: { title: 'Test', body: 'Test body content' },
    metadata: { wordCount: 750 },
    source: 'dashboard',
  };

  describe('createApproval', () => {
    it('creates an approval with all required fields and returns a valid document', async () => {
      const savedDoc = { ...validPayload, _id: 'mock-id-123', status: 'pending', createdAt: new Date() };
      mockSave.mockResolvedValue(savedDoc);

      const result = await createApproval(validPayload);

      expect(mockSave).toHaveBeenCalledOnce();
      expect(result._id).toBeDefined();
      expect(result.vendorId).toBe(validPayload.vendorId);
      expect(result.agentName).toBe('writer');
      expect(result.itemType).toBe('content_draft');
      expect(result.title).toBe(validPayload.title);
      expect(result.draftPayload).toEqual(validPayload.draftPayload);
      expect(result.source).toBe('dashboard');
    });
  });

  describe('approveItem', () => {
    it('updates status to approved and sets decidedBy and decidedAt', async () => {
      const mockItem = {
        _id: 'approval-1',
        status: 'pending',
        save: vi.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      ApprovalQueue.findById.mockResolvedValue(mockItem);

      const result = await approveItem('approval-1', 'admin-user-id', 'Looks good');

      expect(result.status).toBe('approved');
      expect(result.decidedAt).toBeInstanceOf(Date);
      expect(result.decidedBy).toBe('admin-user-id');
      expect(result.decisionReason).toBe('Looks good');
      expect(mockItem.save).toHaveBeenCalledOnce();
    });

    it('throws if item is not pending', async () => {
      const mockItem = { _id: 'approval-1', status: 'rejected', save: vi.fn() };
      ApprovalQueue.findById.mockResolvedValue(mockItem);

      await expect(approveItem('approval-1', 'admin-user-id'))
        .rejects.toThrow('Cannot approve item with status "rejected"');
    });

    it('throws if item not found', async () => {
      ApprovalQueue.findById.mockResolvedValue(null);

      await expect(approveItem('nonexistent', 'admin-user-id'))
        .rejects.toThrow('Approval item not found');
    });
  });

  describe('rejectItem', () => {
    it('throws validation error when reason is not provided', async () => {
      await expect(rejectItem('approval-1', 'admin-user-id', ''))
        .rejects.toThrow('Rejection reason is required');

      await expect(rejectItem('approval-1', 'admin-user-id', null))
        .rejects.toThrow('Rejection reason is required');

      await expect(rejectItem('approval-1', 'admin-user-id', undefined))
        .rejects.toThrow('Rejection reason is required');
    });

    it('updates status to rejected with reason when reason is provided', async () => {
      const mockItem = {
        _id: 'approval-1',
        status: 'pending',
        save: vi.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      ApprovalQueue.findById.mockResolvedValue(mockItem);

      const result = await rejectItem('approval-1', 'admin-user-id', 'Content not relevant');

      expect(result.status).toBe('rejected');
      expect(result.decidedAt).toBeInstanceOf(Date);
      expect(result.decidedBy).toBe('admin-user-id');
      expect(result.decisionReason).toBe('Content not relevant');
      expect(mockItem.save).toHaveBeenCalledOnce();
    });

    it('throws if item is not pending', async () => {
      const mockItem = { _id: 'approval-1', status: 'approved', save: vi.fn() };
      ApprovalQueue.findById.mockResolvedValue(mockItem);

      await expect(rejectItem('approval-1', 'admin-user-id', 'Too late'))
        .rejects.toThrow('Cannot reject item with status "approved"');
    });
  });

  describe('listPending', () => {
    it('returns pending items with pagination by default', async () => {
      const mockItems = [
        { _id: '1', title: 'First', status: 'pending' },
        { _id: '2', title: 'Second', status: 'pending' },
      ];
      mockLean.mockResolvedValue(mockItems);
      ApprovalQueue.countDocuments.mockResolvedValue(2);

      const result = await listPending();

      expect(ApprovalQueue.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
      expect(result.items).toEqual(mockItems);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 2, pages: 1 });
    });

    it('applies filters when provided', async () => {
      mockLean.mockResolvedValue([]);
      ApprovalQueue.countDocuments.mockResolvedValue(0);

      await listPending({ agentName: 'writer', itemType: 'content_draft', vendorId: 'v123', page: 2, limit: 5 });

      expect(ApprovalQueue.find).toHaveBeenCalledWith(expect.objectContaining({
        status: 'pending',
        agentName: 'writer',
        itemType: 'content_draft',
        vendorId: 'v123',
      }));
      expect(mockSkip).toHaveBeenCalledWith(5); // (page 2 - 1) * limit 5
      expect(mockLimit).toHaveBeenCalledWith(5);
    });

    it('allows status override', async () => {
      mockLean.mockResolvedValue([]);
      ApprovalQueue.countDocuments.mockResolvedValue(0);

      await listPending({ status: 'approved' });

      expect(ApprovalQueue.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });
  });

  describe('getApprovalById', () => {
    it('returns populated approval item', async () => {
      const mockItem = { _id: 'approval-1', title: 'Test', status: 'pending' };
      const mockChain = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockItem),
      };
      ApprovalQueue.findById.mockReturnValue(mockChain);

      const result = await getApprovalById('approval-1');

      expect(ApprovalQueue.findById).toHaveBeenCalledWith('approval-1');
      expect(mockChain.populate).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockItem);
    });
  });

  describe('executeApprovedItem', () => {
    it('throws if item is not in approved status', async () => {
      const mockItem = { _id: 'approval-1', status: 'pending', save: vi.fn() };
      ApprovalQueue.findById.mockResolvedValue(mockItem);

      await expect(executeApprovedItem('approval-1'))
        .rejects.toThrow('Cannot execute item with status "pending" — must be "approved"');
    });

    it('sets status to failed and stores error when handler throws', async () => {
      const mockItem = {
        _id: 'approval-1',
        status: 'approved',
        itemType: 'content_draft',
        save: vi.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      ApprovalQueue.findById.mockResolvedValue(mockItem);

      await expect(executeApprovedItem('approval-1'))
        .rejects.toThrow('not yet connected');

      expect(mockItem.status).toBe('failed');
      expect(mockItem.executedAt).toBeInstanceOf(Date);
      expect(mockItem.executionError).toMatch(/not yet connected/);
      expect(mockItem.save).toHaveBeenCalled();
    });

    it('calls the correct handler based on itemType', async () => {
      const mockItem = {
        _id: 'approval-1',
        status: 'approved',
        itemType: 'schema_change',
        save: vi.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      ApprovalQueue.findById.mockResolvedValue(mockItem);

      await expect(executeApprovedItem('approval-1'))
        .rejects.toThrow('schema_change');

      expect(mockItem.executionError).toMatch(/schema_change/);
    });
  });

  describe('compound index', () => {
    it('schema defines the compound index on { vendorId, status, createdAt }', async () => {
      // Verify the model schema has the compound index defined.
      // Since we're mocking the model, we verify the real schema separately.
      // Import the real schema definition to check indexes.
      const { default: mongoose } = await import('mongoose');
      const { default: RealModel } = await vi.importActual('../../models/ApprovalQueue.js');
      const indexes = RealModel.schema.indexes();
      const compoundIndex = indexes.find(([fields]) =>
        fields.vendorId === 1 && fields.status === 1 && fields.createdAt === -1
      );
      expect(compoundIndex).toBeDefined();
    });
  });
});
