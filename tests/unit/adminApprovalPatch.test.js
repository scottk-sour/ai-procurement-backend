import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEditItem = vi.fn();

vi.mock('../../services/approvalQueue.js', () => ({
  approveItem: vi.fn(),
  rejectItem: vi.fn(),
  editItem: (...args) => mockEditItem(...args),
  executeApprovedItem: vi.fn(),
  listPending: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }),
  getApprovalById: vi.fn(),
}));

vi.mock('../../services/indexNowService.js', () => ({
  pingBingIndexNow: vi.fn(),
}));

vi.mock('../../middleware/adminAuth.js', () => ({
  default: (req, _res, next) => {
    req.admin = { id: 'admin-1', email: 'test@tendorai.com' };
    next();
  },
}));

const { default: express } = await import('express');
const { default: adminApprovalRoutes } = await import('../../routes/adminApprovalRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/approvals', adminApprovalRoutes);
  return app;
}

async function request(app, method, url, { body } = {}) {
  const { default: http } = await import('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const opts = {
        hostname: '127.0.0.1', port, path: url, method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('PATCH /api/admin/approvals/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts top-level { body } shape', async () => {
    mockEditItem.mockResolvedValue({ _id: 'a1', draftPayload: { body: 'new body' }, agentName: 'writer', itemType: 'content_draft' });
    const app = buildApp();
    const res = await request(app, 'PATCH', '/api/admin/approvals/a1', {
      body: { body: 'new body' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockEditItem).toHaveBeenCalledWith('a1', 'admin-1', { body: 'new body', title: undefined });
  });

  it('accepts nested { draftPayload: { body } } shape', async () => {
    mockEditItem.mockResolvedValue({ _id: 'a1', draftPayload: { body: 'fixed body' }, agentName: 'writer', itemType: 'content_draft' });
    const app = buildApp();
    const res = await request(app, 'PATCH', '/api/admin/approvals/a1', {
      body: { draftPayload: { body: 'fixed body' } },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockEditItem).toHaveBeenCalledWith('a1', 'admin-1', { body: 'fixed body', title: undefined });
  });

  it('accepts nested { draftPayload: { body, title } }', async () => {
    mockEditItem.mockResolvedValue({ _id: 'a1', draftPayload: { body: 'b', title: 't' }, agentName: 'writer', itemType: 'content_draft' });
    const app = buildApp();
    const res = await request(app, 'PATCH', '/api/admin/approvals/a1', {
      body: { draftPayload: { body: 'b', title: 't' } },
    });
    expect(res.status).toBe(200);
    expect(mockEditItem).toHaveBeenCalledWith('a1', 'admin-1', { body: 'b', title: 't' });
  });

  it('returns 400 when neither shape provides body or title', async () => {
    const app = buildApp();
    const res = await request(app, 'PATCH', '/api/admin/approvals/a1', {
      body: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body.*title/i);
    expect(mockEditItem).not.toHaveBeenCalled();
  });

  it('top-level body takes precedence over nested draftPayload.body', async () => {
    mockEditItem.mockResolvedValue({ _id: 'a1', draftPayload: { body: 'top' }, agentName: 'writer', itemType: 'content_draft' });
    const app = buildApp();
    const res = await request(app, 'PATCH', '/api/admin/approvals/a1', {
      body: { body: 'top', draftPayload: { body: 'nested' } },
    });
    expect(res.status).toBe(200);
    expect(mockEditItem).toHaveBeenCalledWith('a1', 'admin-1', { body: 'top', title: undefined });
  });
});
