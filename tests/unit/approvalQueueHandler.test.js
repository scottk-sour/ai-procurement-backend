import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ─── Shared IDs ────────────────────────────────────────────────
const VENDOR_ID = new mongoose.Types.ObjectId();
const APPROVAL_ID = new mongoose.Types.ObjectId();
const AGENT_RUN_ID = new mongoose.Types.ObjectId();
const MISSING_VENDOR_ID = new mongoose.Types.ObjectId();

// ─── Mock Vendor (only needs findById for existence check) ─────
vi.mock('../../models/Vendor.js', () => {
  const findById = vi.fn().mockImplementation((id) => ({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        id.toString() === VENDOR_ID.toString() ? { _id: VENDOR_ID } : null
      ),
    }),
  }));
  function MockVendor() {}
  MockVendor.findById = findById;
  return { default: MockVendor };
});

// Use real VendorPost model (tests real slug hook + validation)
// but stub .save() since there's no database
const realSave = mongoose.Model.prototype.save;
let savedDocs = [];

beforeEach(() => {
  savedDocs = [];
  // Stub save to skip DB but run validators
  mongoose.Model.prototype.save = async function () {
    await this.validate();
    if (!this.createdAt) this.createdAt = new Date();
    if (!this.updatedAt) this.updatedAt = new Date();
    if (!this._id) this._id = new mongoose.Types.ObjectId();
    savedDocs.push(this);
    return this;
  };
});

// Don't mock ApprovalQueue — we'll test the handler function directly
// by calling it with a fake item object matching the shape executeApprovedItem passes.

// Import the handler via the module (we'll reach into the execution path)
const { default: VendorPost } = await import('../../models/VendorPost.js');

// We can't import executionHandlers directly (it's not exported),
// so we test via executeApprovedItem with a mock ApprovalQueue.
// But for pure handler tests, we'll replicate the handler call pattern.

// Import the real service — we need to mock ApprovalQueue.findById for the
// integration test, but test the handler's VendorPost creation against the
// real VendorPost model.
vi.mock('../../models/ApprovalQueue.js', () => {
  const docs = new Map();
  function MockApproval(data) {
    Object.assign(this, data);
    if (!this._id) this._id = new mongoose.Types.ObjectId();
    this.save = async function () {
      docs.set(this._id.toString(), this);
      return this;
    };
  }
  MockApproval.findById = vi.fn().mockImplementation((id) => {
    return docs.get(id.toString()) || null;
  });
  MockApproval.find = vi.fn().mockReturnValue({
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
  MockApproval.countDocuments = vi.fn().mockResolvedValue(0);
  MockApproval._docs = docs;
  return { default: MockApproval };
});

const { default: ApprovalQueue } = await import('../../models/ApprovalQueue.js');
const {
  createApproval,
  approveItem,
  executeApprovedItem,
} = await import('../../services/approvalQueue.js');

// ─── Valid draft payload ───────────────────────────────────────
const VALID_PAYLOAD = {
  title: 'How much does conveyancing cost in Cardiff in 2026?',
  body: 'Conveyancing in Cardiff typically costs between £800 and £1,500 plus disbursements...',
  category: 'guide',
  tags: ['conveyancing', 'cardiff', 'fees'],
  linkedInText: 'We just published our latest conveyancing cost breakdown...',
  facebookText: 'Wondering how much conveyancing costs in Cardiff?...',
  pillar: 'costs-fees',
  plan: { pillar: 'costs-fees', tactic: 'Beat competitors on specificity', wordCount: 1200 },
  primaryData: 'Based on our last 47 transactions, the average all-in cost was £1,150.',
  topic: 'conveyancing costs cardiff',
  stats: 'Average completion time 12 weeks',
};

// ─── Tests ─────────────────────────────────────────────────────
describe('content_draft execution handler', () => {

  describe('VendorPost creation', () => {
    it('creates a VendorPost with all mapped fields from draftPayload', async () => {
      const item = {
        _id: APPROVAL_ID,
        vendorId: VENDOR_ID,
        agentName: 'writer',
        itemType: 'content_draft',
        title: 'Approval: conveyancing costs',
        draftPayload: VALID_PAYLOAD,
        metadata: { agentRunId: AGENT_RUN_ID },
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };

      // Call the handler path through executeApprovedItem
      // First store the item so findById can return it
      ApprovalQueue._docs.set(item._id.toString(), item);
      ApprovalQueue.findById.mockReturnValue(item);

      const result = await executeApprovedItem(item._id);

      expect(result.status).toBe('executed');
      expect(result.executionResult).toBeDefined();
      expect(result.executionResult.postId).toBeDefined();
      expect(result.executionResult.slug).toBeDefined();
      expect(result.executionResult.vendorId.toString()).toBe(VENDOR_ID.toString());
      expect(result.executionResult.createdAt).toBeDefined();

      const post = savedDocs[0];
      expect(post).toBeDefined();
      expect(post.vendor.toString()).toBe(VENDOR_ID.toString());
      expect(post.title).toBe(VALID_PAYLOAD.title);
      expect(post.body).toBe(VALID_PAYLOAD.body);
      expect(post.status).toBe('draft');
      expect(post.aiGenerated).toBe(true);
      expect(post.category).toBe('guide');
      expect(post.tags).toEqual(['conveyancing', 'cardiff', 'fees']);
      expect(post.linkedInText).toBe(VALID_PAYLOAD.linkedInText);
      expect(post.facebookText).toBe(VALID_PAYLOAD.facebookText);
      expect(post.pillar).toBe('costs-fees');
      expect(post.plan.pillar).toBe('costs-fees');
      expect(post.primaryData).toBe(VALID_PAYLOAD.primaryData);
      expect(post.topic).toBe(VALID_PAYLOAD.topic);
      expect(post.stats).toBe(VALID_PAYLOAD.stats);
      expect(post.relatedApprovalId.toString()).toBe(APPROVAL_ID.toString());
      expect(post.agentRunId.toString()).toBe(AGENT_RUN_ID.toString());
    });

    it('sets agentRunId undefined when metadata has no agentRunId', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { title: 'Test post', body: 'Test body content here.' },
        metadata: {},
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await executeApprovedItem(item._id);

      const post = savedDocs[savedDocs.length - 1];
      expect(post.agentRunId).toBeUndefined();
    });

    it('slug includes date suffix because aiGenerated is true', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { title: 'Test slug generation', body: 'Body content.' },
        metadata: {},
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await executeApprovedItem(item._id);

      const post = savedDocs[savedDocs.length - 1];
      const vendorSuffix = VENDOR_ID.toString().slice(-6);
      expect(post.slug).toMatch(new RegExp(`-${vendorSuffix}-\\d{8}$`));
    });

    it('defaults category to guide when not in payload', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { title: 'No category', body: 'Body.' },
        metadata: {},
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await executeApprovedItem(item._id);

      const post = savedDocs[savedDocs.length - 1];
      expect(post.category).toBe('guide');
    });
  });

  describe('validation errors', () => {
    it('throws if draftPayload.title is missing', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { body: 'No title here' },
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await expect(executeApprovedItem(item._id))
        .rejects.toThrow('draftPayload.title is required');

      expect(item.status).toBe('failed');
      expect(item.executionError).toMatch(/title is required/);
    });

    it('throws if draftPayload.body is missing', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { title: 'No body' },
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await expect(executeApprovedItem(item._id))
        .rejects.toThrow('draftPayload.body is required');
    });

    it('throws if vendorId references a non-existent vendor', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: MISSING_VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { title: 'Good title', body: 'Good body' },
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await expect(executeApprovedItem(item._id))
        .rejects.toThrow('Vendor not found');
    });
  });

  describe('optional fields round-trip', () => {
    it('all optional fields pass through when provided', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: VALID_PAYLOAD,
        metadata: { agentRunId: AGENT_RUN_ID },
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await executeApprovedItem(item._id);

      const post = savedDocs[savedDocs.length - 1];
      expect(post.linkedInText).toBe(VALID_PAYLOAD.linkedInText);
      expect(post.facebookText).toBe(VALID_PAYLOAD.facebookText);
      expect(post.pillar).toBe('costs-fees');
      expect(post.plan.tactic).toBe('Beat competitors on specificity');
      expect(post.primaryData).toBe(VALID_PAYLOAD.primaryData);
      expect(post.stats).toBe(VALID_PAYLOAD.stats);
      expect(post.tags).toEqual(['conveyancing', 'cardiff', 'fees']);
    });

    it('works with minimal payload (title + body only)', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { title: 'Minimal', body: 'Just a body.' },
        metadata: {},
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await executeApprovedItem(item._id);

      const post = savedDocs[savedDocs.length - 1];
      expect(post.title).toBe('Minimal');
      expect(post.body).toBe('Just a body.');
      expect(post.category).toBe('guide');
      expect(post.tags).toEqual([]);
      expect(post.linkedInText).toBeUndefined();
      expect(post.facebookText).toBeUndefined();
      expect(post.pillar).toBeNull();
    });
  });

  describe('dispatcher integration', () => {
    it('sets approval status to executed with executionResult on success', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { title: 'Integration test', body: 'Body here.' },
        metadata: {},
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      const result = await executeApprovedItem(item._id);

      expect(result.status).toBe('executed');
      expect(result.executedAt).toBeInstanceOf(Date);
      expect(result.executionResult.postId).toBeDefined();
      expect(result.executionResult.slug).toBeDefined();
    });

    it('sets approval status to failed with executionError on handler throw', async () => {
      const item = {
        _id: new mongoose.Types.ObjectId(),
        vendorId: VENDOR_ID,
        itemType: 'content_draft',
        draftPayload: { title: 'Missing body' },
        status: 'approved',
        save: vi.fn().mockImplementation(async function () { return this; }),
      };
      ApprovalQueue.findById.mockReturnValue(item);

      await expect(executeApprovedItem(item._id)).rejects.toThrow();

      expect(item.status).toBe('failed');
      expect(item.executedAt).toBeInstanceOf(Date);
      expect(item.executionError).toMatch(/body is required/);
    });
  });
});
