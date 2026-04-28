import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock helpers ──────────────────────────────────────────────
const mockSave = vi.fn();
const mockLean = vi.fn();
const mockPopulate2 = vi.fn().mockReturnValue({ lean: mockLean });
const mockPopulate1 = vi.fn().mockReturnValue({ populate: mockPopulate2 });
const mockLimit = vi.fn().mockReturnValue({ populate: mockPopulate1 });
const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
const mockSort = vi.fn().mockReturnValue({ skip: mockSkip });
const mockPopulateLean = vi.fn().mockReturnValue({ lean: mockLean });
const mockSortPopulate = vi.fn().mockReturnValue({ populate: mockPopulateLean });

vi.mock('../../models/AgentRun.js', () => {
  function MockModel(data) {
    Object.assign(this, data);
    this._id = 'run-id-123';
    this.save = mockSave;
  }

  MockModel.normaliseWeekStarting = function (date) {
    const d = new Date(date);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (day - 1));
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };

  MockModel.findById = vi.fn();
  MockModel.findOne = vi.fn();
  MockModel.find = vi.fn().mockReturnValue({
    sort: vi.fn().mockImplementation(() => ({
      skip: mockSkip,
      populate: mockPopulateLean,
    })),
  });
  MockModel.countDocuments = vi.fn();
  MockModel.aggregate = vi.fn();

  return { default: MockModel };
});

const { default: AgentRun } = await import('../../models/AgentRun.js');
const {
  createRun,
  startRun,
  completeRun,
  failRun,
  getWeeklyRuns,
  findOrCreateRun,
} = await import('../../services/agentRun.js');

// ─── Tests ─────────────────────────────────────────────────────
describe('AgentRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockImplementation(function () { return Promise.resolve(this); });
  });

  // ── normaliseWeekStarting ──────────────────────────────────
  describe('normaliseWeekStarting', () => {
    it('returns Monday 00:00 UTC for a Wednesday', () => {
      // 2026-04-29 is a Wednesday
      const result = AgentRun.normaliseWeekStarting(new Date('2026-04-29T14:30:00Z'));
      expect(result.toISOString()).toBe('2026-04-27T00:00:00.000Z'); // Monday
    });

    it('returns Monday 00:00 UTC for a Monday itself', () => {
      const result = AgentRun.normaliseWeekStarting(new Date('2026-04-27T06:00:00Z'));
      expect(result.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });

    it('returns Monday 00:00 UTC for a Sunday (end of week)', () => {
      // 2026-05-03 is a Sunday
      const result = AgentRun.normaliseWeekStarting(new Date('2026-05-03T23:59:59Z'));
      expect(result.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });

    it('returns Monday 00:00 UTC for Saturday', () => {
      const result = AgentRun.normaliseWeekStarting(new Date('2026-05-02T12:00:00Z'));
      expect(result.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });

    it('handles Sunday midnight exactly', () => {
      const result = AgentRun.normaliseWeekStarting(new Date('2026-05-03T00:00:00Z'));
      expect(result.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });

    it('handles Monday midnight exactly', () => {
      const result = AgentRun.normaliseWeekStarting(new Date('2026-04-27T00:00:00Z'));
      expect(result.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });

    it('handles dates near UTC midnight where local timezone would shift the day', () => {
      // BST (UTC+1): 2026-04-28T00:30:00+01:00 = 2026-04-27T23:30:00Z (still Monday in UTC)
      const result = AgentRun.normaliseWeekStarting(new Date('2026-04-27T23:30:00Z'));
      expect(result.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });

    it('handles January 1 crossing a year boundary', () => {
      // 2026-01-01 is a Thursday
      const result = AgentRun.normaliseWeekStarting(new Date('2026-01-01T10:00:00Z'));
      expect(result.toISOString()).toBe('2025-12-29T00:00:00.000Z'); // Monday Dec 29
    });

    it('handles leap year date', () => {
      // 2028-02-29 is a Tuesday
      const result = AgentRun.normaliseWeekStarting(new Date('2028-02-29T12:00:00Z'));
      expect(result.toISOString()).toBe('2028-02-28T00:00:00.000Z'); // Monday Feb 28
    });
  });

  // ── createRun ──────────────────────────────────────────────
  describe('createRun', () => {
    it('creates a run with all required fields and status pending', async () => {
      const result = await createRun({
        vendorId: 'vendor-1',
        agentName: 'detective',
        summary: 'Initial run',
        metricsBefore: { score: 42 },
      });

      expect(mockSave).toHaveBeenCalledOnce();
      expect(result.vendorId).toBe('vendor-1');
      expect(result.agentName).toBe('detective');
      expect(result.weekStarting).toBeInstanceOf(Date);
      expect(result.weekStarting.getUTCDay()).toBe(1); // Monday
      expect(result.weekStarting.getUTCHours()).toBe(0);
    });

    it('defaults weekStarting to current Monday UTC when omitted', async () => {
      const result = await createRun({
        vendorId: 'vendor-1',
        agentName: 'writer',
      });

      const expectedMonday = AgentRun.normaliseWeekStarting(new Date());
      expect(result.weekStarting.toISOString()).toBe(expectedMonday.toISOString());
    });
  });

  // ── startRun ───────────────────────────────────────────────
  describe('startRun', () => {
    it('moves status to running and sets startedAt', async () => {
      const mockRun = {
        _id: 'run-1',
        status: 'pending',
        save: vi.fn().mockImplementation(function () { return Promise.resolve(this); }),
      };
      AgentRun.findById.mockResolvedValue(mockRun);

      const result = await startRun('run-1');

      expect(result.status).toBe('running');
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(mockRun.save).toHaveBeenCalledOnce();
    });

    it('throws if status is not pending', async () => {
      AgentRun.findById.mockResolvedValue({ _id: 'run-1', status: 'completed' });
      await expect(startRun('run-1')).rejects.toThrow('Cannot start run with status "completed"');
    });
  });

  // ── completeRun ────────────────────────────────────────────
  describe('completeRun', () => {
    it('moves status to completed with duration computed', async () => {
      const startedAt = new Date(Date.now() - 5000);
      const mockRun = {
        _id: 'run-1',
        status: 'running',
        startedAt,
        save: vi.fn().mockImplementation(function () { return Promise.resolve(this); }),
      };
      AgentRun.findById.mockResolvedValue(mockRun);

      const result = await completeRun('run-1', {
        summary: 'Ran 47 queries across 6 platforms.',
        artifacts: { queriesRun: 47, platforms: 6 },
        metricsAfter: { score: 58 },
        relatedApprovalIds: ['approval-1'],
      });

      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.durationMs).toBeGreaterThanOrEqual(4000);
      expect(result.summary).toBe('Ran 47 queries across 6 platforms.');
      expect(result.artifacts).toEqual({ queriesRun: 47, platforms: 6 });
      expect(result.metricsAfter).toEqual({ score: 58 });
      expect(result.relatedApprovalIds).toEqual(['approval-1']);
    });

    it('throws if summary is missing', async () => {
      await expect(completeRun('run-1', {
        artifacts: {},
        metricsAfter: {},
      })).rejects.toThrow('Summary is required');
    });

    it('throws if artifacts is missing', async () => {
      await expect(completeRun('run-1', {
        summary: 'Done',
        metricsAfter: {},
      })).rejects.toThrow('Artifacts are required');
    });

    it('throws if metricsAfter is missing', async () => {
      await expect(completeRun('run-1', {
        summary: 'Done',
        artifacts: {},
      })).rejects.toThrow('metricsAfter is required');
    });
  });

  // ── failRun ────────────────────────────────────────────────
  describe('failRun', () => {
    it('throws if failureReason is missing', async () => {
      await expect(failRun('run-1', {})).rejects.toThrow('failureReason is required');
    });

    it('sets status to failed with reason', async () => {
      const mockRun = {
        _id: 'run-1',
        status: 'running',
        startedAt: new Date(Date.now() - 3000),
        save: vi.fn().mockImplementation(function () { return Promise.resolve(this); }),
      };
      AgentRun.findById.mockResolvedValue(mockRun);

      const result = await failRun('run-1', { failureReason: 'API timeout' });

      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('API timeout');
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.durationMs).toBeGreaterThanOrEqual(2000);
    });

    it('sets status to partial when partialArtifacts provided', async () => {
      const mockRun = {
        _id: 'run-1',
        status: 'running',
        startedAt: new Date(),
        save: vi.fn().mockImplementation(function () { return Promise.resolve(this); }),
      };
      AgentRun.findById.mockResolvedValue(mockRun);

      const result = await failRun('run-1', {
        failureReason: '2 of 6 platforms unreachable',
        partialArtifacts: { completedPlatforms: ['chatgpt', 'perplexity', 'claude', 'gemini'] },
      });

      expect(result.status).toBe('partial');
      expect(result.artifacts).toEqual({ completedPlatforms: ['chatgpt', 'perplexity', 'claude', 'gemini'] });
    });
  });

  // ── getWeeklyRuns ──────────────────────────────────────────
  describe('getWeeklyRuns', () => {
    it('queries with normalised weekStarting and sorts by agentName', async () => {
      const runs = [
        { agentName: 'builder', status: 'completed' },
        { agentName: 'detective', status: 'completed' },
        { agentName: 'writer', status: 'pending' },
      ];
      mockLean.mockResolvedValue(runs);

      const result = await getWeeklyRuns('vendor-1', new Date('2026-04-29T12:00:00Z'));

      expect(AgentRun.find).toHaveBeenCalledWith({
        vendorId: 'vendor-1',
        weekStarting: new Date('2026-04-27T00:00:00.000Z'),
      });
      expect(result).toEqual(runs);
    });
  });

  // ── findOrCreateRun ────────────────────────────────────────
  describe('findOrCreateRun', () => {
    it('returns existing run if one exists for vendor+agent+week', async () => {
      const existing = { _id: 'run-existing', vendorId: 'v1', agentName: 'detective', status: 'pending' };
      AgentRun.findOne.mockResolvedValue(existing);

      const result = await findOrCreateRun({ vendorId: 'v1', agentName: 'detective' });

      expect(result).toEqual(existing);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('creates new run if none exists for vendor+agent+week', async () => {
      AgentRun.findOne.mockResolvedValue(null);

      const result = await findOrCreateRun({ vendorId: 'v1', agentName: 'detective' });

      expect(mockSave).toHaveBeenCalledOnce();
      expect(result.vendorId).toBe('v1');
      expect(result.agentName).toBe('detective');
    });
  });

  // ── Compound indexes ───────────────────────────────────────
  describe('compound indexes', () => {
    it('defines { vendorId: 1, weekStarting: -1, agentName: 1 } for Reporting Agent query', async () => {
      const { default: RealModel } = await vi.importActual('../../models/AgentRun.js');
      const indexes = RealModel.schema.indexes();
      const found = indexes.find(([fields]) =>
        fields.vendorId === 1 && fields.weekStarting === -1 && fields.agentName === 1
      );
      expect(found).toBeDefined();
    });

    it('defines { weekStarting: -1, status: 1 } for health monitoring', async () => {
      const { default: RealModel } = await vi.importActual('../../models/AgentRun.js');
      const indexes = RealModel.schema.indexes();
      const found = indexes.find(([fields]) =>
        fields.weekStarting === -1 && fields.status === 1
      );
      expect(found).toBeDefined();
    });
  });
});
