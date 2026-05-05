import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_PRO = { _id: new mongoose.Types.ObjectId(), company: 'Test Firm', tier: 'pro', vendorType: 'solicitor', services: ['Solicitors'], location: { city: 'Cardiff' } };
const VENDOR_FREE = { _id: new mongoose.Types.ObjectId(), company: 'Free Firm', tier: 'free', vendorType: 'solicitor' };

const mockAgentRunCreate = vi.fn();

vi.mock('../../models/Vendor.js', () => ({
  default: { findById: vi.fn(), find: vi.fn() },
}));
vi.mock('../../models/AgentRun.js', () => {
  function M() {}
  M.create = (...args) => mockAgentRunCreate(...args);
  M.normaliseWeekStarting = (d) => {
    const date = new Date(d); const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - (day - 1)); date.setUTCHours(0, 0, 0, 0); return date;
  };
  return { default: M };
});
vi.mock('../../models/AIMentionScan.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../models/AeoReport.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../models/VendorProduct.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../models/Review.js', () => ({ default: { aggregate: vi.fn() } }));
vi.mock('../../utils/visibilityScore.js', () => ({
  calculateVisibilityScore: vi.fn(() => ({ score: 45, tips: [{ message: 'Add products', impact: 'high', category: 'products', action: 'Go to Products' }] })),
}));

const { default: Vendor } = await import('../../models/Vendor.js');
const { default: AIMentionScan } = await import('../../models/AIMentionScan.js');
const { default: AeoReport } = await import('../../models/AeoReport.js');
const { default: VendorProduct } = await import('../../models/VendorProduct.js');
const { default: Review } = await import('../../models/Review.js');
const { runDetectiveForVendor } = await import('../../services/detectiveAgent.js');

describe('Detective Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentRunCreate.mockImplementation(async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data }));
    VendorProduct.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    Review.aggregate.mockResolvedValue([{ reviewCount: 0, averageRating: 0 }]);
    AeoReport.findOne.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) }) });
  });

  it('returns failed status for non-Pro vendor', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_FREE) });

    const result = await runDetectiveForVendor(VENDOR_FREE._id);

    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('not_pro_tier');
    expect(mockAgentRunCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', agentName: 'detective' }));
  });

  it('returns partial when no Recon data', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    AIMentionScan.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    const result = await runDetectiveForVendor(VENDOR_PRO._id);

    expect(result.status).toBe('partial');
    expect(result.artifacts.reason).toBe('no_recon_data');
  });

  it('produces findings and completed status with full data', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    AIMentionScan.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([
      { vendorId: VENDOR_PRO._id, platform: 'chatgpt', mentioned: true, competitorsMentioned: ['Jones & Partners'] },
      { vendorId: VENDOR_PRO._id, platform: 'perplexity', mentioned: false, competitorsMentioned: ['Jones & Partners', 'Williams Legal'] },
      { vendorId: VENDOR_PRO._id, platform: 'claude', mentioned: false, competitorsMentioned: ['Williams Legal'] },
      { vendorId: VENDOR_PRO._id, platform: 'gemini', mentioned: true, competitorsMentioned: [] },
      { vendorId: VENDOR_PRO._id, platform: 'grok', mentioned: false, competitorsMentioned: ['Jones & Partners'] },
      { vendorId: VENDOR_PRO._id, platform: 'metaai', mentioned: false, competitorsMentioned: [] },
    ]) });

    const result = await runDetectiveForVendor(VENDOR_PRO._id);

    expect(result.status).toBe('completed');
    expect(result.artifacts.findings.length).toBeGreaterThan(0);
    expect(result.artifacts.findings.length).toBeLessThanOrEqual(5);
    expect(result.artifacts.mentionSummary.platformsCited).toBe(2);
    expect(result.artifacts.mentionSummary.uniquePlatforms).toBe(6);
  });

  it('correctly aggregates competitors sorted by citation count', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    AIMentionScan.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([
      { vendorId: VENDOR_PRO._id, platform: 'chatgpt', mentioned: false, competitorsMentioned: ['A', 'B', 'C'] },
      { vendorId: VENDOR_PRO._id, platform: 'perplexity', mentioned: false, competitorsMentioned: ['A', 'B'] },
      { vendorId: VENDOR_PRO._id, platform: 'claude', mentioned: false, competitorsMentioned: ['A'] },
    ]) });

    const result = await runDetectiveForVendor(VENDOR_PRO._id);

    expect(result.artifacts.topCompetitors[0].name).toBe('A');
    expect(result.artifacts.topCompetitors[0].citationCount).toBe(3);
    expect(result.artifacts.topCompetitors[1].name).toBe('B');
    expect(result.artifacts.topCompetitors[1].citationCount).toBe(2);
  });

  it('caps findings at 5', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    AIMentionScan.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([
      { vendorId: VENDOR_PRO._id, platform: 'chatgpt', mentioned: false, competitorsMentioned: ['X'] },
      { vendorId: VENDOR_PRO._id, platform: 'perplexity', mentioned: false, competitorsMentioned: ['X'] },
      { vendorId: VENDOR_PRO._id, platform: 'claude', mentioned: false, competitorsMentioned: ['X'] },
      { vendorId: VENDOR_PRO._id, platform: 'gemini', mentioned: false, competitorsMentioned: ['X'] },
      { vendorId: VENDOR_PRO._id, platform: 'grok', mentioned: false, competitorsMentioned: ['X'] },
      { vendorId: VENDOR_PRO._id, platform: 'metaai', mentioned: false, competitorsMentioned: ['X'] },
    ]) });
    AeoReport.findOne.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ gaps: [
      { key: 'schema', title: 'No schema', explanation: 'Missing', impact: 10 },
      { key: 'meta', title: 'Bad meta', explanation: 'Short', impact: 8 },
      { key: 'social', title: 'No social', explanation: 'None', impact: 5 },
      { key: 'content', title: 'Thin', explanation: 'Low', impact: 5 },
      { key: 'faq', title: 'No FAQ', explanation: 'Missing', impact: 5 },
    ] }) }) }) });

    const result = await runDetectiveForVendor(VENDOR_PRO._id);

    expect(result.artifacts.findings.length).toBe(5);
  });

  it('handles 0-mention edge case in summary', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    AIMentionScan.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([
      { vendorId: VENDOR_PRO._id, platform: 'chatgpt', mentioned: false, competitorsMentioned: [] },
      { vendorId: VENDOR_PRO._id, platform: 'perplexity', mentioned: false, competitorsMentioned: [] },
    ]) });

    const result = await runDetectiveForVendor(VENDOR_PRO._id);

    expect(result.summary).toContain('Not cited by any AI platform this week');
  });

  it('handles all-platforms-cited edge case in summary', async () => {
    Vendor.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR_PRO) });
    AIMentionScan.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([
      { vendorId: VENDOR_PRO._id, platform: 'chatgpt', mentioned: true, competitorsMentioned: [] },
      { vendorId: VENDOR_PRO._id, platform: 'perplexity', mentioned: true, competitorsMentioned: [] },
    ]) });

    const result = await runDetectiveForVendor(VENDOR_PRO._id);

    expect(result.summary).toContain('Cited by all 2 platforms');
  });
});
