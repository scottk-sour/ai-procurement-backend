import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_ID = new mongoose.Types.ObjectId();

vi.mock('../../models/Vendor.js', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: VENDOR_ID,
          company: 'Test Firm',
          name: 'Test Name',
          vendorType: 'solicitor',
          tier: 'managed',
          contactInfo: {},
        }),
      }),
    }),
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    }),
  },
}));

vi.mock('../../models/AeoReport.js', () => ({
  default: {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('../../models/AIMentionScan.js', () => ({
  default: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
}));

const mockAgentRunNormalise = (d) => {
  const date = new Date(d);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

vi.mock('../../models/AgentRun.js', () => ({
  default: {
    normaliseWeekStarting: mockAgentRunNormalise,
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    findOne: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) }),
  },
}));

vi.mock('../../models/DirectoryListing.js', () => ({
  default: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));

vi.mock('../../models/ApprovalQueue.js', () => ({
  default: {
    find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

const { buildWeeklyProDigest } = await import('../../services/weeklyProDigest.js');

describe('Reporter Agent — Digest Structure Stress Tests', () => {
  it('digest has all top-level required fields', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(digest).toHaveProperty('vendor');
    expect(digest).toHaveProperty('weekStarting');
    expect(digest).toHaveProperty('weekEnding');
    expect(digest).toHaveProperty('score');
    expect(digest).toHaveProperty('citations');
    expect(digest).toHaveProperty('agentActivity');
    expect(digest).toHaveProperty('needsAttention');
    expect(digest).toHaveProperty('competitorMoves');
    expect(digest).toHaveProperty('generatedAt');
  });

  it('score fields are numeric or null (never undefined)', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(digest.score.current === null || typeof digest.score.current === 'number').toBe(true);
    expect(digest.score.previous === null || typeof digest.score.previous === 'number').toBe(true);
    expect(digest.score.delta === null || typeof digest.score.delta === 'number').toBe(true);
  });

  it('citations.total is number not null when no scans exist', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(typeof digest.citations.total).toBe('number');
    expect(digest.citations.total).toBe(0);
  });

  it('all 6 platform keys present in byPlatform', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    const platforms = ['chatgpt', 'perplexity', 'claude', 'gemini', 'grok', 'meta_ai'];
    for (const p of platforms) {
      expect(digest.citations.byPlatform).toHaveProperty(p);
      expect(typeof digest.citations.byPlatform[p].mentioned).toBe('number');
      expect(typeof digest.citations.byPlatform[p].target).toBe('number');
    }
  });

  it('agentActivity has all 5 agent sections', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(digest.agentActivity).toHaveProperty('writer');
    expect(digest.agentActivity).toHaveProperty('detective');
    expect(digest.agentActivity).toHaveProperty('listings');
    expect(digest.agentActivity).toHaveProperty('reviews');
    expect(digest.agentActivity).toHaveProperty('reconnaissance');
  });

  it('all agent sections have ran:false when no data exists', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(digest.agentActivity.writer.ran).toBe(false);
    expect(digest.agentActivity.detective.ran).toBe(false);
    expect(digest.agentActivity.listings.ran).toBe(false);
    expect(digest.agentActivity.reviews.ran).toBe(false);
    expect(digest.agentActivity.reconnaissance.ran).toBe(false);
  });

  it('needsAttention is an array (empty when no pending items)', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(Array.isArray(digest.needsAttention)).toBe(true);
    expect(digest.needsAttention).toHaveLength(0);
  });

  it('competitorMoves is an array (empty when no scans)', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(Array.isArray(digest.competitorMoves)).toBe(true);
    expect(digest.competitorMoves).toHaveLength(0);
  });

  it('weekStarting is a Monday', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(digest.weekStarting.getUTCDay()).toBe(1);
  });

  it('weekEnding is a Sunday', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(digest.weekEnding.getUTCDay()).toBe(0);
  });

  it('vendor section has required fields', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(digest.vendor).toHaveProperty('id');
    expect(digest.vendor).toHaveProperty('firmName');
    expect(digest.vendor).toHaveProperty('vendorType');
    expect(digest.vendor).toHaveProperty('tier');
    expect(typeof digest.vendor.id).toBe('string');
    expect(typeof digest.vendor.firmName).toBe('string');
  });

  it('score.history is always an array', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(Array.isArray(digest.score.history)).toBe(true);
  });

  it('generatedAt is a Date instance', async () => {
    const digest = await buildWeeklyProDigest(VENDOR_ID);
    expect(digest.generatedAt).toBeInstanceOf(Date);
  });
});
