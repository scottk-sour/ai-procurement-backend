import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_A = new mongoose.Types.ObjectId();
const VENDOR_B = new mongoose.Types.ObjectId();

const mockFind = vi.fn();
const mockFindOne = vi.fn();

vi.mock('../../models/WeeklyReport.js', () => ({
  default: {
    find: (...args) => mockFind(...args),
    findOne: (...args) => mockFindOne(...args),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('../../middleware/vendorAuth.js', () => ({
  default: (req, _res, next) => {
    const token = req.headers.authorization;
    if (!token) {
      return _res.status(401).json({ success: false, error: 'AUTHENTICATION_REQUIRED' });
    }
    req.vendorId = req.headers['x-test-vendor-id'] || String(VENDOR_A);
    req.vendor = { id: req.vendorId, vendorId: req.vendorId };
    next();
  },
}));

const { default: express } = await import('express');
const { default: reportRoutes } = await import('../../routes/reportRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vendors/:vendorId/reports', reportRoutes);
  return app;
}

async function request(app, method, url, { headers = {} } = {}) {
  const { default: http } = await import('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const opts = {
        hostname: '127.0.0.1', port, path: url, method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json', ...headers },
      };
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

describe('Report Routes — REST alignment', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('GET /api/vendors/:vendorId/reports returns 200 with matching token', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    });

    const res = await request(app, 'GET', `/api/vendors/${VENDOR_A}/reports`, {
      headers: { authorization: 'Bearer test', 'x-test-vendor-id': String(VENDOR_A) },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  it('GET /api/vendors/:vendorId/reports returns 401 without auth', async () => {
    const res = await request(app, 'GET', `/api/vendors/${VENDOR_A}/reports`);
    expect(res.status).toBe(401);
  });

  it('GET /api/vendors/:vendorId/reports returns 403 when URL vendorId mismatches token', async () => {
    const res = await request(app, 'GET', `/api/vendors/${VENDOR_B}/reports`, {
      headers: { authorization: 'Bearer test', 'x-test-vendor-id': String(VENDOR_A) },
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Cannot access');
  });

  it('GET /api/vendors/:vendorId/reports/:reportId returns 404 for non-existent report', async () => {
    const fakeReportId = new mongoose.Types.ObjectId();
    mockFindOne.mockResolvedValue(null);

    const res = await request(app, 'GET', `/api/vendors/${VENDOR_A}/reports/${fakeReportId}`, {
      headers: { authorization: 'Bearer test', 'x-test-vendor-id': String(VENDOR_A) },
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Report not found');
  });

  it('GET /api/vendors/:vendorId/reports/:reportId returns 403 for mismatched vendor', async () => {
    const fakeReportId = new mongoose.Types.ObjectId();

    const res = await request(app, 'GET', `/api/vendors/${VENDOR_B}/reports/${fakeReportId}`, {
      headers: { authorization: 'Bearer test', 'x-test-vendor-id': String(VENDOR_A) },
    });

    expect(res.status).toBe(403);
  });
});
