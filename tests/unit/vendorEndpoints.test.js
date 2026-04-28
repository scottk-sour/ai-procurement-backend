import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock data ──────────────────────────────────────────
const VENDOR_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const VENDOR_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

// ─── Mock AgentRun ─────────────────────────────────────────────
const mockAgentRunLean = vi.fn();
const mockAgentRunPopulate = vi.fn().mockReturnValue({ lean: mockAgentRunLean });
const mockAgentRunSort = vi.fn().mockReturnValue({ populate: mockAgentRunPopulate });

vi.mock('../../models/AgentRun.js', () => {
  function MockAgentRun() {}
  MockAgentRun.normaliseWeekStarting = function (date) {
    const d = new Date(date);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (day - 1));
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  MockAgentRun.find = vi.fn().mockReturnValue({ sort: mockAgentRunSort });
  return { default: MockAgentRun };
});

// ─── Mock ApprovalQueue ────────────────────────────────────────
const mockApprovalLean = vi.fn();
const mockApprovalLimit = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: mockApprovalLean }) });
const mockApprovalSkip = vi.fn().mockReturnValue({ limit: mockApprovalLimit });
const mockApprovalSort = vi.fn().mockReturnValue({ skip: mockApprovalSkip });

vi.mock('../../models/ApprovalQueue.js', () => {
  function MockApproval() {}
  MockApproval.find = vi.fn().mockReturnValue({ sort: mockApprovalSort });
  MockApproval.findById = vi.fn();
  MockApproval.countDocuments = vi.fn();
  return { default: MockApproval };
});

// ─── Mock vendorAuth middleware ────────────────────────────────
vi.mock('../../middleware/vendorAuth.js', () => ({
  default: (req, _res, next) => {
    req.vendorId = req.headers['x-test-vendor-id'] || VENDOR_A;
    req.vendor = { id: req.vendorId, vendorId: req.vendorId };
    next();
  },
}));

const { default: AgentRun } = await import('../../models/AgentRun.js');
const { default: ApprovalQueue } = await import('../../models/ApprovalQueue.js');

// ─── Build Express apps with actual routers ────────────────────
const { default: express } = await import('express');
const { default: vendorAgentRunRoutes } = await import('../../routes/vendorAgentRunRoutes.js');
const { default: vendorApprovalRoutes } = await import('../../routes/vendorApprovalRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vendor/agent-runs', vendorAgentRunRoutes);
  app.use('/api/vendor/approvals', vendorApprovalRoutes);
  return app;
}

// Lightweight supertest replacement using node fetch
async function request(app, method, url, { headers = {}, body } = {}) {
  const { default: http } = await import('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const opts = {
        hostname: '127.0.0.1',
        port,
        path: url,
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json', ...headers },
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

// ─── Tests ─────────────────────────────────────────────────────
describe('Vendor Endpoints', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── Agent Runs ─────────────────────────────────────────────
  describe('GET /api/vendor/agent-runs/current-week', () => {
    it('returns runs scoped to the authenticated vendor', async () => {
      const runs = [
        { agentName: 'detective', status: 'completed', vendorId: VENDOR_A },
        { agentName: 'writer', status: 'pending', vendorId: VENDOR_A },
      ];
      mockAgentRunLean.mockResolvedValue(runs);

      const res = await request(app, 'GET', '/api/vendor/agent-runs/current-week', {
        headers: { 'x-test-vendor-id': VENDOR_A },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.runs).toEqual(runs);
      expect(res.body.weekStarting).toBeDefined();

      const findCall = AgentRun.find.mock.calls[0][0];
      expect(findCall.vendorId).toBe(VENDOR_A);
    });

    it('returns empty array for a vendor with no runs (not another vendor\'s data)', async () => {
      mockAgentRunLean.mockResolvedValue([]);

      const res = await request(app, 'GET', '/api/vendor/agent-runs/current-week', {
        headers: { 'x-test-vendor-id': VENDOR_B },
      });

      expect(res.status).toBe(200);
      expect(res.body.runs).toEqual([]);

      const findCall = AgentRun.find.mock.calls[0][0];
      expect(findCall.vendorId).toBe(VENDOR_B);
    });
  });

  describe('GET /api/vendor/agent-runs/week/:weekStarting', () => {
    it('normalises weekStarting and queries correctly', async () => {
      mockAgentRunLean.mockResolvedValue([]);

      const res = await request(app, 'GET', '/api/vendor/agent-runs/week/2026-04-29');

      expect(res.status).toBe(200);
      const findCall = AgentRun.find.mock.calls[0][0];
      expect(new Date(findCall.weekStarting).toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });
  });

  describe('GET /api/vendor/agent-runs/history', () => {
    it('returns correct number of week buckets', async () => {
      mockAgentRunLean.mockResolvedValue([]);

      const res = await request(app, 'GET', '/api/vendor/agent-runs/history?weeks=4');

      expect(res.status).toBe(200);
      expect(res.body.weeks).toHaveLength(4);
      for (const week of res.body.weeks) {
        expect(week.weekStarting).toBeDefined();
        expect(new Date(week.weekStarting).getUTCDay()).toBe(1);
        expect(Array.isArray(week.runs)).toBe(true);
      }
    });

    it('defaults to 8 weeks', async () => {
      mockAgentRunLean.mockResolvedValue([]);

      const res = await request(app, 'GET', '/api/vendor/agent-runs/history');

      expect(res.status).toBe(200);
      expect(res.body.weeks).toHaveLength(8);
    });

    it('caps at 52 weeks maximum', async () => {
      mockAgentRunLean.mockResolvedValue([]);

      const res = await request(app, 'GET', '/api/vendor/agent-runs/history?weeks=200');

      expect(res.status).toBe(200);
      expect(res.body.weeks).toHaveLength(52);
    });
  });

  // ── Approvals ──────────────────────────────────────────────
  describe('GET /api/vendor/approvals', () => {
    it('returns approvals scoped to authenticated vendor', async () => {
      const items = [
        { _id: 'a1', vendorId: VENDOR_A, title: 'Draft blog', status: 'pending' },
      ];
      mockApprovalLean.mockResolvedValue(items);
      ApprovalQueue.countDocuments.mockResolvedValue(1);

      const res = await request(app, 'GET', '/api/vendor/approvals', {
        headers: { 'x-test-vendor-id': VENDOR_A },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.items).toEqual(items);
      expect(res.body.pagination.total).toBe(1);

      const findCall = ApprovalQueue.find.mock.calls[0][0];
      expect(findCall.vendorId).toBe(VENDOR_A);
    });

    it('paginates correctly', async () => {
      mockApprovalLean.mockResolvedValue([]);
      ApprovalQueue.countDocuments.mockResolvedValue(50);

      const res = await request(app, 'GET', '/api/vendor/approvals?page=3&limit=5');

      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({ page: 3, limit: 5, total: 50, pages: 10 });
      expect(mockApprovalSkip).toHaveBeenCalledWith(10);
      expect(mockApprovalLimit).toHaveBeenCalledWith(5);
    });
  });

  describe('GET /api/vendor/approvals/:id', () => {
    it('returns 403 if vendorId does not match', async () => {
      ApprovalQueue.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'approval-1',
            vendorId: VENDOR_B,
            title: 'Not yours',
          }),
        }),
      });

      const res = await request(app, 'GET', '/api/vendor/approvals/approval-1', {
        headers: { 'x-test-vendor-id': VENDOR_A },
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied');
    });

    it('returns approval if vendorId matches', async () => {
      ApprovalQueue.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'approval-1',
            vendorId: VENDOR_A,
            title: 'My draft',
          }),
        }),
      });

      const res = await request(app, 'GET', '/api/vendor/approvals/approval-1', {
        headers: { 'x-test-vendor-id': VENDOR_A },
      });

      expect(res.status).toBe(200);
      expect(res.body.item.title).toBe('My draft');
    });

    it('returns 404 if approval does not exist', async () => {
      ApprovalQueue.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });

      const res = await request(app, 'GET', '/api/vendor/approvals/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
