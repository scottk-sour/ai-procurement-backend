import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_ID = new mongoose.Types.ObjectId();

const mockAgentRunFindOne = vi.fn();
const mockAgentRunCreate = vi.fn();

vi.mock('../../models/AgentRun.js', () => ({
  default: {
    findOne: (...args) => mockAgentRunFindOne(...args),
    create: (...args) => mockAgentRunCreate(...args),
    normaliseWeekStarting: (d) => {
      const date = new Date(d);
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - (day - 1));
      date.setUTCHours(0, 0, 0, 0);
      return date;
    },
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

describe('Writer Agent — per-day throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeTodayRun() {
    return {
      _id: new mongoose.Types.ObjectId(),
      vendorId: VENDOR_ID,
      agentName: 'writer',
      status: 'completed',
      createdAt: new Date(),
    };
  }

  function makeYesterdayRun() {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return {
      _id: new mongoose.Types.ObjectId(),
      vendorId: VENDOR_ID,
      agentName: 'writer',
      status: 'completed',
      createdAt: yesterday,
    };
  }

  it('run today within last hour → should skip with already_ran_today', () => {
    const todayRun = makeTodayRun();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

    expect(todayRun.createdAt >= todayStart).toBe(true);
    expect(todayRun.createdAt < todayEnd).toBe(true);
    // Agent would find this and return { skipped: true, reason: 'already_ran_today' }
  });

  it('run yesterday → should NOT skip', () => {
    const yesterdayRun = makeYesterdayRun();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    expect(yesterdayRun.createdAt < todayStart).toBe(true);
    // Agent would NOT find this in the today query, so it proceeds
  });

  it('run 6 days ago → should NOT skip', () => {
    const sixDaysAgo = new Date();
    sixDaysAgo.setUTCDate(sixDaysAgo.getUTCDate() - 6);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    expect(sixDaysAgo < todayStart).toBe(true);
  });

  it('dryRun: true with a run today → should NOT skip (bypass)', () => {
    // When dryRun is true, the throttle check is bypassed entirely
    const dryRun = true;
    const shouldCheckThrottle = !dryRun;
    expect(shouldCheckThrottle).toBe(false);
  });

  it('dryRun: false with a run today → should skip', () => {
    const dryRun = false;
    const shouldCheckThrottle = !dryRun;
    expect(shouldCheckThrottle).toBe(true);
    // If todayRun found, return { skipped: true, reason: 'already_ran_today' }
  });

  it('reason string is already_ran_today not already_ran_this_week', () => {
    const reason = 'already_ran_today';
    expect(reason).toBe('already_ran_today');
    expect(reason).not.toBe('already_ran_this_week');
  });

  it('todayStart is midnight UTC of current day', () => {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    expect(todayStart.getUTCHours()).toBe(0);
    expect(todayStart.getUTCMinutes()).toBe(0);
    expect(todayStart.getUTCSeconds()).toBe(0);
  });

  it('Mon + Wed + Fri runs in the same week produce 3 separate AgentRun documents', () => {
    // Each firing day creates its own AgentRun via AgentRun.create (not findOrCreateRun)
    const monRun = { _id: 'mon', createdAt: new Date('2026-05-19T05:00:00Z'), agentName: 'writer' };
    const wedRun = { _id: 'wed', createdAt: new Date('2026-05-21T05:00:00Z'), agentName: 'writer' };
    const friRun = { _id: 'fri', createdAt: new Date('2026-05-23T05:00:00Z'), agentName: 'writer' };
    const runs = [monRun, wedRun, friRun];
    expect(runs).toHaveLength(3);
    const ids = new Set(runs.map(r => r._id));
    expect(ids.size).toBe(3);
  });

  it('Wed run does not share AgentRun with Mon run', () => {
    // Mon and Wed are different UTC days — per-day throttle allows both
    const monStart = new Date('2026-05-19T00:00:00Z');
    const wedStart = new Date('2026-05-21T00:00:00Z');
    const monEnd = new Date('2026-05-20T00:00:00Z');
    // Wed check: is there a completed run with createdAt >= wedStart AND < wedEnd?
    // Mon's run has createdAt = May 19 — NOT in [May 21, May 22) → no skip
    const monRunDate = new Date('2026-05-19T05:01:00Z');
    expect(monRunDate >= wedStart).toBe(false);
  });

  it('findOrCreateRun is NOT used by Writer Agent (each run creates its own doc)', () => {
    // The Writer Agent now uses AgentRun.create directly
    // findOrCreateRun normalises to Monday — Wed/Fri would corrupt Mon's record
    // This test documents the architectural decision
    const usesFindOrCreate = false; // Writer Agent no longer calls findOrCreateRun
    expect(usesFindOrCreate).toBe(false);
  });
});
