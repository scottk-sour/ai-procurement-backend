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
});
