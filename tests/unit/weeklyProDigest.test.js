import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_ID = new mongoose.Types.ObjectId();
const VENDOR_PRO = {
  _id: VENDOR_ID,
  company: 'Harrison & Co Solicitors',
  name: 'James Harrison',
  vendorType: 'solicitor',
  tier: 'managed',
  contactInfo: { name: 'James Harrison' },
};

const mockVendorFindById = vi.fn();
const mockVendorFind = vi.fn();
const mockAeoReportFind = vi.fn();
const mockAIMentionScanFind = vi.fn();
const mockAgentRunFind = vi.fn();
const mockAgentRunNormalise = vi.fn((d) => {
  const date = new Date(d);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date;
});
const mockDirectoryListingFind = vi.fn();
const mockApprovalQueueFind = vi.fn();
const mockApprovalQueueCountDocuments = vi.fn();

vi.mock('../../models/Vendor.js', () => ({
  default: {
    findById: (...args) => mockVendorFindById(...args),
    find: (...args) => mockVendorFind(...args),
  },
}));

vi.mock('../../models/AeoReport.js', () => ({
  default: {
    find: (...args) => mockAeoReportFind(...args),
  },
}));

vi.mock('../../models/AIMentionScan.js', () => ({
  default: {
    find: (...args) => mockAIMentionScanFind(...args),
  },
}));

vi.mock('../../models/AgentRun.js', () => ({
  default: {
    find: (...args) => mockAgentRunFind(...args),
    normaliseWeekStarting: (...args) => mockAgentRunNormalise(...args),
  },
}));

vi.mock('../../models/DirectoryListing.js', () => ({
  default: {
    find: (...args) => mockDirectoryListingFind(...args),
  },
}));

vi.mock('../../models/ApprovalQueue.js', () => ({
  default: {
    find: (...args) => mockApprovalQueueFind(...args),
    countDocuments: (...args) => mockApprovalQueueCountDocuments(...args),
  },
}));

const { buildWeeklyProDigest } = await import('../../services/weeklyProDigest.js');

describe('Weekly Pro Digest', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVendorFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) }),
    });

    mockAeoReportFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    });

    mockAIMentionScanFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockAgentRunFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockDirectoryListingFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockApprovalQueueFind.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    });
    mockApprovalQueueCountDocuments.mockResolvedValue(0);
  });

  it('returns correct output shape with empty data', async () => {
    const result = await buildWeeklyProDigest(VENDOR_ID);

    expect(result.vendor).toBeDefined();
    expect(result.vendor.id).toBe(String(VENDOR_ID));
    expect(result.vendor.firmName).toBe('Harrison & Co Solicitors');
    expect(result.vendor.firstName).toBe('James');
    expect(result.vendor.vendorType).toBe('solicitor');
    expect(result.vendor.tier).toBe('managed');

    expect(result.weekStarting).toBeInstanceOf(Date);
    expect(result.weekEnding).toBeInstanceOf(Date);
    expect(result.weekEnding > result.weekStarting).toBe(true);

    expect(result.score).toEqual({
      current: null,
      previous: null,
      delta: null,
      history: [],
    });

    expect(result.citations).toBeDefined();
    expect(result.citations.total).toBe(0);
    expect(result.citations.byPlatform).toBeDefined();
    expect(result.citations.byPlatform.chatgpt).toEqual({ mentioned: 0, target: 0, change: 0 });
    expect(result.citations.byPlatform.meta_ai).toEqual({ mentioned: 0, target: 0, change: 0 });
    expect(result.citations.captured).toEqual([]);

    expect(result.agentActivity).toBeDefined();
    expect(result.agentActivity.writer.ran).toBe(false);
    expect(result.agentActivity.detective.ran).toBe(false);
    expect(result.agentActivity.listings.ran).toBe(false);
    expect(result.agentActivity.reviews.ran).toBe(false);
    expect(result.agentActivity.reconnaissance.ran).toBe(false);

    expect(result.needsAttention).toEqual([]);
    expect(result.competitorMoves).toEqual([]);
    expect(result.nextWeekPlan).toBeNull();
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('parses firstName correctly', async () => {
    const result = await buildWeeklyProDigest(VENDOR_ID);
    expect(result.vendor.firstName).toBe('James');
  });

  it('returns null firstName for generic contact names', async () => {
    mockVendorFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          ...VENDOR_PRO,
          name: 'Admin Team',
          contactInfo: { name: 'Reception' },
        }),
      }),
    });

    const result = await buildWeeklyProDigest(VENDOR_ID);
    expect(result.vendor.firstName).toBeNull();
  });

  it('populates agent activity when runs exist', async () => {
    const weekStarting = mockAgentRunNormalise(new Date());
    mockAgentRunFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          agentName: 'writer',
          weekStarting,
          status: 'completed',
          artifacts: { postsDrafted: 1, draftTitle: 'Conveyancing Costs 2026' },
        },
        {
          agentName: 'detective',
          weekStarting,
          status: 'completed',
          artifacts: {
            findings: [
              { type: 'platform_silence', severity: 'high', title: 'Not on Perplexity', detail: 'Not mentioned', recommendation: 'Claim profile' },
            ],
          },
        },
      ]),
    });

    const result = await buildWeeklyProDigest(VENDOR_ID);

    expect(result.agentActivity.writer.ran).toBe(true);
    expect(result.agentActivity.writer.draftsProduced).toBe(1);
    expect(result.agentActivity.writer.draftTitles).toEqual(['Conveyancing Costs 2026']);

    expect(result.agentActivity.detective.ran).toBe(true);
    expect(result.agentActivity.detective.findingsCount).toBe(1);
    expect(result.agentActivity.detective.topFinding.title).toBe('Not on Perplexity');
  });

  it('populates citations when mention scans exist', async () => {
    mockAIMentionScanFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { platform: 'chatgpt', mentioned: true, position: 'top3', prompt: 'best solicitor Cardiff', responseSnippet: 'Harrison & Co', scanDate: new Date() },
        { platform: 'perplexity', mentioned: false, position: 'not_mentioned', prompt: 'solicitor Cardiff', competitorsMentioned: ['Rival Law'], scanDate: new Date() },
      ]),
    });

    const result = await buildWeeklyProDigest(VENDOR_ID);

    expect(result.citations.total).toBe(1);
    expect(result.citations.byPlatform.chatgpt.mentioned).toBe(1);
    expect(result.citations.captured).toHaveLength(1);
    expect(result.citations.captured[0].platform).toBe('chatgpt');
  });

  it('populates competitor moves from non-mentioned scans', async () => {
    mockAIMentionScanFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { platform: 'perplexity', mentioned: false, position: 'not_mentioned', prompt: 'solicitor Cardiff', competitorsMentioned: ['Rival Law', 'Other Firm'], scanDate: new Date() },
      ]),
    });

    const result = await buildWeeklyProDigest(VENDOR_ID);

    expect(result.competitorMoves).toHaveLength(2);
    expect(result.competitorMoves[0].competitor).toBe('Rival Law');
    expect(result.competitorMoves[0].platform).toBe('perplexity');
  });

  it('throws for non-existent vendor', async () => {
    mockVendorFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });

    await expect(buildWeeklyProDigest(new mongoose.Types.ObjectId())).rejects.toThrow('Vendor not found');
  });
});
