import { describe, it, expect, vi, beforeEach } from 'vitest';

// vendorAuth.js calls process.exit(1) if JWT_SECRET is missing.
// Set it before any imports trigger module loading.
process.env.JWT_SECRET = 'test-secret-for-vitest';

import mongoose from 'mongoose';

// ─── IDs ───────────────────────────────────────────────────────
const VENDOR_ID = new mongoose.Types.ObjectId();
const VENDOR_FREE_ID = new mongoose.Types.ObjectId();
const VENDOR_UNSUPPORTED_ID = new mongoose.Types.ObjectId();

// ─── Mock Anthropic SDK ────────────────────────────────────────
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    this.messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

// ─── Mock Vendor ───────────────────────────────────────────────
const vendorDb = {
  [VENDOR_ID.toString()]: {
    _id: VENDOR_ID, tier: 'pro', vendorType: 'solicitor',
    company: 'Jones & Partners', location: { city: 'Cardiff' },
    practiceAreas: ['conveyancing'],
  },
  [VENDOR_FREE_ID.toString()]: {
    _id: VENDOR_FREE_ID, tier: 'free', vendorType: 'solicitor',
    company: 'Free Firm', location: { city: 'London' },
  },
  [VENDOR_UNSUPPORTED_ID.toString()]: {
    _id: VENDOR_UNSUPPORTED_ID, tier: 'pro', vendorType: 'office-equipment',
    company: 'Copy Co', location: { city: 'Swansea' },
  },
};

vi.mock('../../models/Vendor.js', () => {
  const findById = vi.fn().mockImplementation((id) => ({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(vendorDb[id.toString()] || null),
    }),
  }));
  function V() {}
  V.findById = findById;
  V.find = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });
  return { default: V };
});

// ─── Mock AgentRun ─────────────────────────────────────────────
let agentRunStore = {};
let agentRunIdCounter = 0;

vi.mock('../../models/AgentRun.js', () => {
  function MockRun(data) {
    Object.assign(this, data);
    this._id = this._id || new mongoose.Types.ObjectId();
  }
  MockRun.normaliseWeekStarting = function (date) {
    const d = new Date(date);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (day - 1));
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  MockRun.findOne = vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
  });
  MockRun.find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
  });
  MockRun.countDocuments = vi.fn().mockResolvedValue(0);
  return { default: MockRun };
});

// ─── Mock agentRun service ─────────────────────────────────────
const mockFindOrCreateRun = vi.fn();
const mockStartRun = vi.fn();
const mockCompleteRun = vi.fn();
const mockFailRun = vi.fn();

vi.mock('../../services/agentRun.js', () => ({
  findOrCreateRun: (...args) => mockFindOrCreateRun(...args),
  startRun: (...args) => mockStartRun(...args),
  completeRun: (...args) => mockCompleteRun(...args),
  failRun: (...args) => mockFailRun(...args),
}));

// ─── Mock approvalQueue service ────────────────────────────────
const mockCreateApproval = vi.fn();

vi.mock('../../services/approvalQueue.js', () => ({
  createApproval: (...args) => mockCreateApproval(...args),
}));

// ─── Import the module under test ──────────────────────────────
const {
  runWriterAgentForVendor,
  resolveNextTopic,
  SONNET_INPUT_COST_PER_M,
  SONNET_OUTPUT_COST_PER_M,
  MONTHLY_COST_CAP_USD,
} = await import('../../services/writerAgent.js');

const { default: AgentRun } = await import('../../models/AgentRun.js');

// ─── Helpers ───────────────────────────────────────────────────
function setupDefaultMocks() {
  const runId = new mongoose.Types.ObjectId();
  mockFindOrCreateRun.mockResolvedValue({ _id: runId, status: 'pending' });
  mockStartRun.mockResolvedValue({ _id: runId, status: 'running', startedAt: new Date() });
  mockCompleteRun.mockResolvedValue({ _id: runId, status: 'completed' });
  mockFailRun.mockResolvedValue({ _id: runId, status: 'failed' });

  const approvalId = new mongoose.Types.ObjectId();
  mockCreateApproval.mockResolvedValue({ _id: approvalId });

  AgentRun.countDocuments.mockResolvedValue(0);
  AgentRun.findOne.mockImplementation(() => ({
    sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
  }));
  AgentRun.find.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
  }));

  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      title: 'How Much Does Conveyancing Cost in Cardiff in 2026?',
      body: '## Direct Answer\n\nConveyancing in Cardiff typically costs...',
      linkedInText: 'We just published our latest cost breakdown...',
      facebookText: 'Wondering about conveyancing costs?',
    }) }],
    usage: { input_tokens: 4000, output_tokens: 3500 },
  });

  return { runId, approvalId };
}

// ─── Tests ─────────────────────────────────────────────────────
describe('Writer Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  // ── Tier gating ────────────────────────────────────────────
  describe('tier gating', () => {
    it('skips with not_pro_tier for free vendor', async () => {
      const result = await runWriterAgentForVendor(VENDOR_FREE_ID);
      expect(result).toEqual({ skipped: true, reason: 'not_pro_tier', vendorId: VENDOR_FREE_ID.toString() });
      expect(mockFindOrCreateRun).not.toHaveBeenCalled();
    });
  });

  // ── Vertical gating ───────────────────────────────────────
  describe('vertical gating', () => {
    it('skips with no_pillar_library_for_vertical for unsupported vendorType', async () => {
      const result = await runWriterAgentForVendor(VENDOR_UNSUPPORTED_ID);
      expect(result).toEqual({ skipped: true, reason: 'no_pillar_library_for_vertical', vendorId: VENDOR_UNSUPPORTED_ID.toString() });
    });
  });

  // ── Per-vendor cap ─────────────────────────────────────────
  describe('monthly per-vendor cap', () => {
    it('skips when 4 completed runs exist this month', async () => {
      AgentRun.countDocuments.mockResolvedValue(4);
      const result = await runWriterAgentForVendor(VENDOR_ID);
      expect(result).toEqual({ skipped: true, reason: 'monthly_per_vendor_cap_reached', vendorId: VENDOR_ID.toString() });
    });
  });

  // ── Platform cost cap ──────────────────────────────────────
  describe('monthly platform cost cap', () => {
    it('fails run when projected cost exceeds $75', async () => {
      const { runId } = setupDefaultMocks();
      AgentRun.find.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { artifacts: { costEstimateUSD: 74.99 } },
          ]),
        }),
      });

      const result = await runWriterAgentForVendor(VENDOR_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('monthly_cost_cap_reached');
      expect(mockFailRun).toHaveBeenCalledWith(
        runId,
        expect.objectContaining({ failureReason: expect.stringContaining('monthly_cost_cap_would_be_exceeded') }),
      );
    });
  });

  // ── Topic rotation ─────────────────────────────────────────
  describe('topic rotation (resolveNextTopic)', () => {
    it('selects pillar 1 topic 0 when no previous run', () => {
      const result = resolveNextTopic('solicitor', null, null);
      expect(result.pillarId).toBe('costs-fees');
      expect(result.topicIndex).toBe(0);
    });

    it('advances to next topic in same pillar', () => {
      const result = resolveNextTopic('solicitor', 'costs-fees', 2);
      expect(result.pillarId).toBe('costs-fees');
      expect(result.topicIndex).toBe(3);
    });

    it('advances to next pillar when current pillar topics exhausted', () => {
      const result = resolveNextTopic('solicitor', 'costs-fees', 3);
      expect(result.pillarId).toBe('process-timelines');
      expect(result.topicIndex).toBe(0);
    });

    it('loops back to first pillar after last', () => {
      const result = resolveNextTopic('solicitor', 'firm-expertise', 3);
      expect(result.pillarId).toBe('costs-fees');
      expect(result.topicIndex).toBe(0);
    });

    it('returns null for vendorType with no library', () => {
      const result = resolveNextTopic('office-equipment', null, null);
      expect(result).toBeNull();
    });
  });

  // ── Successful run ─────────────────────────────────────────
  describe('successful run', () => {
    it('creates ApprovalQueue with content_draft and correct metadata', async () => {
      const { runId, approvalId } = setupDefaultMocks();

      const result = await runWriterAgentForVendor(VENDOR_ID);

      expect(result.success).toBe(true);
      expect(result.approvalId).toBeDefined();
      expect(result.agentRunId).toBeDefined();

      expect(mockCreateApproval).toHaveBeenCalledWith(expect.objectContaining({
        vendorId: VENDOR_ID,
        agentName: 'writer',
        itemType: 'content_draft',
        title: expect.stringContaining('Draft:'),
        source: 'writer-agent-cron',
        metadata: expect.objectContaining({
          agentRunId: runId,
          costEstimateUSD: expect.any(Number),
          inputTokens: 4000,
          outputTokens: 3500,
          model: 'claude-sonnet-4-20250514',
        }),
      }));
    });

    it('creates AgentRun with correct artifacts', async () => {
      setupDefaultMocks();

      await runWriterAgentForVendor(VENDOR_ID);

      expect(mockCompleteRun).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          summary: expect.stringContaining('Drafted'),
          artifacts: expect.objectContaining({
            lastPillar: 'costs-fees',
            lastTopicIndex: 0,
            postsDrafted: 1,
            costEstimateUSD: expect.any(Number),
            inputTokens: 4000,
            outputTokens: 3500,
            model: 'claude-sonnet-4-20250514',
          }),
          relatedApprovalIds: expect.any(Array),
        }),
      );
    });
  });

  // ── Claude failures ────────────────────────────────────────
  describe('AI failure handling', () => {
    it('calls failRun on Claude API error', async () => {
      const { runId } = setupDefaultMocks();
      mockCreate.mockRejectedValue(new Error('API rate limit'));

      const result = await runWriterAgentForVendor(VENDOR_ID);

      expect(result.success).toBe(false);
      expect(mockFailRun).toHaveBeenCalledWith(runId, expect.objectContaining({
        failureReason: expect.stringContaining('claude_api_error'),
      }));
    });

    it('calls failRun on JSON parse failure', async () => {
      const { runId } = setupDefaultMocks();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'This is not JSON at all' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await runWriterAgentForVendor(VENDOR_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('ai_response_parse_failed');
      expect(mockFailRun).toHaveBeenCalledWith(runId, expect.objectContaining({
        failureReason: 'ai_response_parse_failed',
      }));
    });
  });

  // ── Cost calculation ───────────────────────────────────────
  describe('cost calculation', () => {
    it('computes cost correctly: 4000 input + 3500 output = $0.0645', () => {
      const cost = (4000 / 1_000_000 * SONNET_INPUT_COST_PER_M) +
                   (3500 / 1_000_000 * SONNET_OUTPUT_COST_PER_M);
      expect(cost).toBeCloseTo(0.0645, 4);
    });

    it('returns costEstimateUSD in the result', async () => {
      setupDefaultMocks();
      const result = await runWriterAgentForVendor(VENDOR_ID);
      expect(result.costEstimateUSD).toBeCloseTo(0.0645, 4);
    });
  });

  // ── Dry run ────────────────────────────────────────────────
  describe('dry run mode', () => {
    it('tags metadata with dryRun: true', async () => {
      setupDefaultMocks();
      const result = await runWriterAgentForVendor(VENDOR_ID, { dryRun: true });
      expect(result.dryRun).toBe(true);
      expect(mockCreateApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ dryRun: true }),
        }),
      );
    });
  });
});
