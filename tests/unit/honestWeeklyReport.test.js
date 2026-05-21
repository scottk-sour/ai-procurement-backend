import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_ID = new mongoose.Types.ObjectId();
const WEEK_START = new Date('2026-05-18T00:00:00.000Z');

const mockWeeklyReportCreate = vi.fn();
const mockAgentRunFind = vi.fn();
const mockApprovalQueueFind = vi.fn();
const mockWeeklyReportFind = vi.fn();
const mockAIMentionScanFind = vi.fn();
const mockAIMentionScanCountDocuments = vi.fn();
const mockVendorFindById = vi.fn();

vi.mock('../../models/WeeklyReport.js', () => ({
  default: {
    create: (...args) => mockWeeklyReportCreate(...args),
    find: (...args) => mockWeeklyReportFind(...args),
  },
}));
vi.mock('../../models/Vendor.js', () => ({
  default: {
    findById: (...args) => mockVendorFindById(...args),
    find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
  },
}));
vi.mock('../../services/reporter/filterRealCompetitors.js', () => ({
  filterRealCompetitors: vi.fn(async (rawNames) =>
    rawNames.map(name => ({ name, raw: name }))
  ),
}));
vi.mock('../../models/AgentRun.js', () => ({
  default: { find: (...args) => mockAgentRunFind(...args) },
}));
vi.mock('../../models/ApprovalQueue.js', () => ({
  default: { find: (...args) => mockApprovalQueueFind(...args) },
}));
vi.mock('../../models/AIMentionScan.js', () => ({
  default: {
    find: (...args) => mockAIMentionScanFind(...args),
    countDocuments: (...args) => mockAIMentionScanCountDocuments(...args),
  },
}));

const { buildAIVisibilityIntelligenceReport, vendorHasRealScans } = await import('../../services/reporter/buildReport.js');

const VENDOR = {
  _id: VENDOR_ID,
  company: 'Harrison & Co',
  vendorType: 'solicitor',
  location: { city: 'Cardiff' },
  tier: 'managed',
};

const REAL_SCANS = [
  { vendorId: VENDOR_ID, platform: 'chatgpt', mentioned: true, prompt: 'best solicitor Cardiff', competitorsMentioned: ['Jones Law', 'Williams Legal'], scanDate: new Date('2026-05-19'), status: 'ok' },
  { vendorId: VENDOR_ID, platform: 'perplexity', mentioned: false, prompt: 'best solicitor Cardiff', competitorsMentioned: ['Jones Law', 'Morgan & Partners'], scanDate: new Date('2026-05-19'), status: 'ok' },
  { vendorId: VENDOR_ID, platform: 'claude', mentioned: false, prompt: 'conveyancing solicitor Cardiff', competitorsMentioned: ['Williams Legal'], scanDate: new Date('2026-05-19'), status: 'ok' },
  { vendorId: VENDOR_ID, platform: 'gemini', mentioned: true, prompt: 'conveyancing solicitor Cardiff', competitorsMentioned: ['Jones Law'], scanDate: new Date('2026-05-19'), status: 'ok' },
];

describe('Honest Weekly Report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVendorFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(VENDOR) });
    mockAgentRunFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([
      { artifacts: { mentionsFound: 2, platformsQueried: 4 }, status: 'completed' },
    ]) });
    mockApprovalQueueFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockWeeklyReportFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
    });
    mockAIMentionScanFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(REAL_SCANS) });
    mockWeeklyReportCreate.mockImplementation(async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data }));
  });

  it('vendorHasRealScans returns false when no scans exist', async () => {
    mockAIMentionScanCountDocuments.mockResolvedValue(0);
    const { hasRealScans, scanCount } = await vendorHasRealScans(VENDOR_ID);
    expect(hasRealScans).toBe(false);
    expect(scanCount).toBe(0);
  });

  it('vendorHasRealScans returns true when scans exist', async () => {
    mockAIMentionScanCountDocuments.mockResolvedValue(12);
    const { hasRealScans, scanCount } = await vendorHasRealScans(VENDOR_ID);
    expect(hasRealScans).toBe(true);
    expect(scanCount).toBe(12);
  });

  it('report with real scan data contains NO synthetic competitor scores or revenue exposure', async () => {
    const report = await buildAIVisibilityIntelligenceReport(VENDOR_ID, WEEK_START);

    expect(report.syntheticDataFlags).toEqual([]);

    expect(report.revenueExposure).toBeUndefined();
    expect(report.scoreHeader.monthlyOpportunityLoss).toBeUndefined();
    expect(report.scoreHeader.rankInCity).toBeUndefined();
    expect(report.scoreHeader.totalFirmsInCity).toBeUndefined();
    expect(report.scoreHeader.competitorsAhead).toBeUndefined();

    expect(report.perceptionAnalysis).toBeUndefined();
    expect(report.opportunityFeed).toBeUndefined();
    expect(report.authorityGraph).toBeUndefined();
    expect(report.projections).toBeUndefined();
  });

  it('"Who AI recommended instead" is built from real competitorsMentioned data', async () => {
    const report = await buildAIVisibilityIntelligenceReport(VENDOR_ID, WEEK_START);

    const nonYouCompetitors = report.competitors.filter(c => !c.isYou);
    expect(nonYouCompetitors.length).toBeGreaterThan(0);

    const jonesLaw = nonYouCompetitors.find(c => c.firmName.toLowerCase().includes('jones'));
    expect(jonesLaw).toBeDefined();
    expect(jonesLaw.citationCount).toBe(3);

    const you = report.competitors.find(c => c.isYou);
    expect(you).toBeDefined();
    expect(you.firmName).toBe('Harrison & Co');
    expect(you.citationCount).toBe(2);
  });

  it('"Who AI recommended instead" is absent (empty) when no scan data', async () => {
    mockAIMentionScanFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockAgentRunFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    const report = await buildAIVisibilityIntelligenceReport(VENDOR_ID, WEEK_START);

    const nonYouCompetitors = report.competitors.filter(c => !c.isYou);
    expect(nonYouCompetitors.length).toBe(0);
  });

  it('prompt analysis built from real scan prompts when present', async () => {
    const report = await buildAIVisibilityIntelligenceReport(VENDOR_ID, WEEK_START);

    expect(report.promptAnalysis.length).toBeGreaterThan(0);
    const cardiffPrompt = report.promptAnalysis.find(p => p.prompt.includes('Cardiff'));
    expect(cardiffPrompt).toBeDefined();
    expect(typeof cardiffPrompt.youCited).toBe('boolean');
    expect(Array.isArray(cardiffPrompt.competitorsCited)).toBe(true);
  });

  it('board summary states the truth when firm was not mentioned', async () => {
    mockAIMentionScanFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([
      { vendorId: VENDOR_ID, platform: 'chatgpt', mentioned: false, prompt: 'solicitor Cardiff', competitorsMentioned: ['Jones Law'], scanDate: new Date(), status: 'ok' },
      { vendorId: VENDOR_ID, platform: 'perplexity', mentioned: false, prompt: 'solicitor Cardiff', competitorsMentioned: [], scanDate: new Date(), status: 'ok' },
    ]) });
    mockAgentRunFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ artifacts: { mentionsFound: 0 }, status: 'completed' }]) });

    const report = await buildAIVisibilityIntelligenceReport(VENDOR_ID, WEEK_START);

    expect(report.boardSummary).toContain('did not mention');
    expect(report.boardSummary).toContain('Harrison & Co');
    expect(report.boardSummary).toContain('2 prompts');
  });

  it('toClientJSON no longer strips syntheticDataFlags', async () => {
    // Import the real model (not mocked) to test the method
    const { default: RealWeeklyReport } = await vi.importActual('../../models/WeeklyReport.js');
    const doc = new RealWeeklyReport({
      vendorId: VENDOR_ID,
      weekStartDate: new Date(),
      weekEndDate: new Date(),
      reportNumber: 'AVI-TEST-2026-W21',
      syntheticDataFlags: [{ field: 'test', isSynthetic: true, method: 'test', replaceCondition: 'test' }],
    });
    const clientJSON = doc.toClientJSON();
    expect(clientJSON.syntheticDataFlags).toBeDefined();
    expect(clientJSON.syntheticDataFlags).toHaveLength(1);
    expect(clientJSON.syntheticDataFlags[0].field).toBe('test');
  });
});
