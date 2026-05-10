import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_A = new mongoose.Types.ObjectId();
const WEEK_STARTING = new Date('2026-05-05T00:00:00.000Z');
const WEEK_ENDING = new Date('2026-05-11T23:59:59.999Z');

const DIGEST_FIXTURE = {
  vendor: { id: String(VENDOR_A), firmName: 'Harrison & Co', firstName: 'James', vendorType: 'solicitor', tier: 'managed' },
  weekStarting: WEEK_STARTING,
  weekEnding: WEEK_ENDING,
  score: { current: 42, previous: 35, delta: 7, history: [] },
  citations: { total: 2, byPlatform: { chatgpt: { mentioned: 1, target: 3, change: 0 }, perplexity: { mentioned: 1, target: 3, change: 0 }, claude: { mentioned: 0, target: 3, change: 0 }, gemini: { mentioned: 0, target: 3, change: 0 }, grok: { mentioned: 0, target: 3, change: 0 }, meta_ai: { mentioned: 0, target: 3, change: 0 } }, captured: [{ platform: 'chatgpt', query: 'solicitor Cardiff', position: 'top3', snippet: 'Harrison & Co...', capturedAt: new Date() }] },
  agentActivity: { writer: { ran: true, draftsProduced: 1, draftTitles: ['Costs Guide'], pendingApproval: 1 }, detective: { ran: true, findingsCount: 2, topFinding: { type: 'platform_silence', severity: 'high', title: 'Not on Gemini', detail: 'detail', recommendation: 'Claim profile' } }, listings: { ran: true, submitted: 2, live: 3, pending: 1, directories: [] }, reviews: { ran: false, sent: 0, skipped: { optedOut: 0, cooldown: 0, alreadyReviewed: 0 } }, reconnaissance: { ran: true, queriesScanned: 18, platformsScanned: 6 } },
  needsAttention: [{ type: 'draft_approval', title: 'Draft: Costs Guide', href: '/vendor-dashboard/approvals' }],
  competitorMoves: [{ platform: 'perplexity', query: 'solicitor Cardiff', competitor: 'Rival Law', capturedAt: new Date() }],
  nextWeekPlan: null,
  generatedAt: new Date(),
};

const mockWeeklyReportFindOne = vi.fn();
const mockWeeklyReportFind = vi.fn();
const mockWeeklyReportCreate = vi.fn();
const mockWeeklyReportFindOrCreate = vi.fn();

function leanable(valueFn) {
  const obj = { lean: () => valueFn(), then: (res, rej) => valueFn().then(res, rej) };
  return obj;
}

vi.mock('../../models/WeeklyReport.js', () => {
  return {
    default: {
      findOne: (...args) => leanable(() => Promise.resolve(mockWeeklyReportFindOne(...args))),
      find: (...args) => mockWeeklyReportFind(...args),
      create: (...args) => mockWeeklyReportCreate(...args),
      findOrCreate: (...args) => mockWeeklyReportFindOrCreate(...args),
    },
  };
});

vi.mock('../../middleware/vendorAuth.js', () => ({
  default: (req, _res, next) => {
    req.vendorId = req.headers['x-test-vendor-id'] || String(VENDOR_A);
    req.vendor = { id: req.vendorId, vendorId: req.vendorId };
    next();
  },
}));

vi.mock('../../models/AgentRun.js', () => ({
  default: {
    normaliseWeekStarting: (d) => {
      const date = new Date(d);
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - (day - 1));
      date.setUTCHours(0, 0, 0, 0);
      return date;
    },
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    findOne: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) }),
  },
}));

vi.mock('../../models/AIMentionScan.js', () => ({
  default: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));

vi.mock('../../models/DirectoryListing.js', () => ({
  default: { find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) },
}));

vi.mock('../../services/writerAgent.js', () => ({
  resolveNextTopic: () => null,
}));

vi.mock('../../models/Vendor.js', () => ({
  default: { findById: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) }) },
}));

const { default: express } = await import('express');
const { default: weeklyReportRoutes } = await import('../../routes/weeklyReportRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vendor/weekly-report', weeklyReportRoutes);
  return app;
}

async function request(app, method, url, { headers = {} } = {}) {
  const { default: http } = await import('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const opts = { hostname: '127.0.0.1', port, path: url, method: method.toUpperCase(), headers: { 'Content-Type': 'application/json', ...headers } };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      req.end();
    });
  });
}

describe('WeeklyReport Model (findOrCreate)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a new doc when none exists', async () => {
    mockWeeklyReportFindOrCreate.mockResolvedValue({ vendorId: VENDOR_A, weekStarting: WEEK_STARTING, digest: DIGEST_FIXTURE });
    const result = await mockWeeklyReportFindOrCreate(VENDOR_A, WEEK_STARTING, DIGEST_FIXTURE);
    expect(result.vendorId).toEqual(VENDOR_A);
    expect(mockWeeklyReportFindOrCreate).toHaveBeenCalledTimes(1);
  });

  it('returns existing doc on duplicate call', async () => {
    const existing = { vendorId: VENDOR_A, weekStarting: WEEK_STARTING, digest: DIGEST_FIXTURE };
    mockWeeklyReportFindOrCreate.mockResolvedValue(existing);
    const result = await mockWeeklyReportFindOrCreate(VENDOR_A, WEEK_STARTING, DIGEST_FIXTURE);
    expect(result).toBe(existing);
  });

  it('toClientJSON formats dates as ISO strings', () => {
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      vendorId: VENDOR_A,
      weekStarting: WEEK_STARTING,
      weekEnding: WEEK_ENDING,
      digest: DIGEST_FIXTURE,
      generatedAt: new Date(),
      cronVersion: 'v1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const toObject = () => doc;
    const clientJSON = {
      id: doc._id.toString(),
      vendorId: doc.vendorId.toString(),
      weekStarting: doc.weekStarting.toISOString(),
      weekEnding: doc.weekEnding.toISOString(),
      digest: doc.digest,
      generatedAt: doc.generatedAt.toISOString(),
      cronVersion: 'v1',
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };

    expect(typeof clientJSON.weekStarting).toBe('string');
    expect(clientJSON.weekStarting).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof clientJSON.generatedAt).toBe('string');
  });
});

describe('WeeklyReport Routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('GET /:weekStarting returns 404 when no snapshot exists', async () => {
    mockWeeklyReportFindOne.mockResolvedValue(null);
    const res = await request(app, 'GET', '/api/vendor/weekly-report/2026-05-05');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('GET /:weekStarting returns report when snapshot exists', async () => {
    mockWeeklyReportFindOne.mockResolvedValue({
      toClientJSON: () => ({
        id: 'abc123',
        vendorId: String(VENDOR_A),
        weekStarting: WEEK_STARTING.toISOString(),
        weekEnding: WEEK_ENDING.toISOString(),
        digest: DIGEST_FIXTURE,
        generatedAt: new Date().toISOString(),
        cronVersion: 'v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });

    const res = await request(app, 'GET', '/api/vendor/weekly-report/2026-05-05');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.report.vendorId).toBe(String(VENDOR_A));
    expect(res.body.report.cronVersion).toBe('v1');
  });

  it('GET /list returns reports array', async () => {
    const reports = [
      { weekStarting: new Date('2026-05-05'), weekEnding: new Date('2026-05-11'), digest: { score: { current: 42 }, citations: { total: 2 }, agentActivity: { listings: { submitted: 1 }, writer: { draftsProduced: 1 } } } },
      { weekStarting: new Date('2026-04-28'), weekEnding: new Date('2026-05-04'), digest: { score: { current: 35 }, citations: { total: 0 }, agentActivity: { listings: { submitted: 0 }, writer: { draftsProduced: 0 } } } },
    ];
    mockWeeklyReportFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(reports) }),
        }),
      }),
    });

    const res = await request(app, 'GET', '/api/vendor/weekly-report/list');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reports).toHaveLength(2);
    expect(res.body.reports[0].score).toBe(42);
  });

  it('GET /list limits to 12', async () => {
    mockWeeklyReportFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn((n) => {
          expect(n).toBe(12);
          return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) };
        }),
      }),
    });

    const res = await request(app, 'GET', '/api/vendor/weekly-report/list');
    expect(res.status).toBe(200);
  });

  it('GET /:weekStarting/score-history returns history array', async () => {
    const reports = [
      { weekStarting: new Date('2026-05-05'), weekEnding: new Date('2026-05-11'), digest: { score: { current: 42 } } },
      { weekStarting: new Date('2026-04-28'), weekEnding: new Date('2026-05-04'), digest: { score: { current: 35 } } },
    ];
    mockWeeklyReportFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(reports) }),
        }),
      }),
    });

    const res = await request(app, 'GET', '/api/vendor/weekly-report/2026-05-05/score-history');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.history).toHaveLength(2);
    const scores = res.body.history.map(h => h.score);
    expect(scores).toContain(42);
    expect(scores).toContain(35);
    expect(res.body.joinedScore).toBeDefined();
  });

  it('GET /:weekStarting returns 400 for invalid date', async () => {
    const res = await request(app, 'GET', '/api/vendor/weekly-report/not-a-date');
    expect(res.status).toBe(400);
  });

  it('GET /:weekStarting/competitor-moves returns moves and summary', async () => {
    mockWeeklyReportFindOne.mockResolvedValue({
      digest: {
        competitorMoves: [
          { platform: 'perplexity', query: 'solicitor Cardiff', competitor: 'Rival Law', capturedAt: new Date() },
          { platform: 'chatgpt', query: 'family solicitor Cardiff', competitor: 'Rival Law', capturedAt: new Date() },
        ],
      },
    });

    const res = await request(app, 'GET', '/api/vendor/weekly-report/2026-05-05/competitor-moves');
    expect(res.status).toBe(200);
    expect(res.body.moves).toHaveLength(2);
    expect(res.body.summary.totalCompetitorWins).toBe(2);
    expect(res.body.summary.topCompetitors[0].name).toBe('Rival Law');
    expect(res.body.summary.topCompetitors[0].citationCount).toBe(2);
  });
});
