import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindById = vi.fn();
const mockFindOne = vi.fn();
const mockSave = vi.fn();

vi.mock('../../models/AgentRun.js', () => {
  const M = function () {};
  M.findById = (...args) => mockFindById(...args);
  M.findOne = (...args) => mockFindOne(...args);
  M.normaliseWeekStarting = (d) => {
    const date = new Date(d); const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - (day - 1)); date.setUTCHours(0, 0, 0, 0); return date;
  };
  return { default: M };
});

const { completeRun, startRun } = await import('../../services/agentRun.js');

function makeRun(overrides = {}) {
  return {
    _id: 'run-' + Math.random().toString(36).slice(2, 8),
    vendorId: 'vendor-123',
    agentName: 'writer',
    weekStarting: new Date('2026-06-09'),
    status: 'running',
    startedAt: new Date(),
    save: mockSave.mockResolvedValue(true),
    ...overrides,
  };
}

describe('completeRun — metricsAfter handling', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('completes with metricsAfter present (normal path)', async () => {
    const run = makeRun();
    mockFindById.mockResolvedValue(run);
    await completeRun(run._id, {
      summary: 'test', artifacts: { foo: 1 }, metricsAfter: { cost: 0.5 },
    });
    expect(run.status).toBe('completed');
    expect(run.metricsAfter).toEqual({ cost: 0.5 });
    expect(mockSave).toHaveBeenCalled();
  });

  it('completes with empty metrics when metricsAfter is missing (warns, does not throw)', async () => {
    const run = makeRun();
    mockFindById.mockResolvedValue(run);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await completeRun(run._id, {
      summary: 'blocked draft', artifacts: { blocked: true },
    });

    expect(run.status).toBe('completed');
    expect(run.metricsAfter).toEqual({});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('metricsAfter missing'));
    spy.mockRestore();
  });

  it('still throws for missing summary', async () => {
    await expect(completeRun('x', { artifacts: {}, metricsAfter: {} }))
      .rejects.toThrow('Summary is required');
  });

  it('still throws for missing artifacts', async () => {
    await expect(completeRun('x', { summary: 'x', metricsAfter: {} }))
      .rejects.toThrow('Artifacts are required');
  });
});

describe('startRun — stale run handling', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('auto-closes a stale running record older than 2 hours', async () => {
    const staleRun = makeRun({
      status: 'running',
      startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    const newRun = makeRun({ status: 'pending' });

    mockFindById.mockResolvedValue(newRun);
    mockFindOne.mockResolvedValue(staleRun);

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await startRun(newRun._id);

    expect(staleRun.status).toBe('failed');
    expect(staleRun.failureReason).toBe('stale run auto-closed');
    expect(newRun.status).toBe('running');
    expect(mockSave).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not close a recent running record (under 2 hours)', async () => {
    const newRun = makeRun({ status: 'pending' });
    mockFindById.mockResolvedValue(newRun);
    mockFindOne.mockResolvedValue(null);

    await startRun(newRun._id);
    expect(newRun.status).toBe('running');
  });
});
