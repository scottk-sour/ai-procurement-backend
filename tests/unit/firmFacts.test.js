import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_A = new mongoose.Types.ObjectId();

const mockFindOrCreate = vi.fn();

vi.mock('../../models/FirmFacts.js', () => {
  const STAGE1_PATHS = ['stage1.regulatoryNumber', 'stage1.transactionCountLastYear', 'stage1.typicalAllInCost'];
  const STAGE2_PATHS = ['stage2.formalComplaintsThisYear', 'stage2.complaintResolutionDays'];
  const isFilled = (f) => {
    if (!f || f.value === null || f.value === undefined) return false;
    if (typeof f.value === 'string' && f.value.trim() === '') return false;
    return true;
  };
  return {
    STAGE1_PATHS,
    STAGE2_PATHS,
    isFilled,
    default: {
      findOne: vi.fn(),
      findOrCreateForVendor: (...args) => mockFindOrCreate(...args),
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

const { isFilled, STAGE1_PATHS } = await import('../../models/FirmFacts.js');
const { default: express } = await import('express');
const { default: firmFactsRoutes } = await import('../../routes/firmFactsRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/firmfacts', firmFactsRoutes);
  return app;
}

async function request(app, method, url, { headers = {}, body } = {}) {
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
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('FirmFacts', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  describe('isFilled helper', () => {
    it('returns false for null value', () => {
      expect(isFilled({ value: null })).toBe(false);
    });

    it('returns false for undefined value', () => {
      expect(isFilled({ value: undefined })).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isFilled({ value: '' })).toBe(false);
      expect(isFilled({ value: '   ' })).toBe(false);
    });

    it('returns true for non-empty value', () => {
      expect(isFilled({ value: 'Cardiff' })).toBe(true);
      expect(isFilled({ value: 247 })).toBe(true);
      expect(isFilled({ value: 0 })).toBe(true);
    });

    it('returns false for null/undefined input', () => {
      expect(isFilled(null)).toBe(false);
      expect(isFilled(undefined)).toBe(false);
    });
  });

  describe('STAGE1_PATHS', () => {
    it('contains exactly 3 required paths', () => {
      expect(STAGE1_PATHS).toHaveLength(3);
      expect(STAGE1_PATHS).toContain('stage1.regulatoryNumber');
      expect(STAGE1_PATHS).toContain('stage1.transactionCountLastYear');
      expect(STAGE1_PATHS).toContain('stage1.typicalAllInCost');
    });
  });

  describe('GET /api/firmfacts/me', () => {
    it('returns firmFacts for authenticated vendor', async () => {
      const doc = { vendorId: VENDOR_A, completionPercentage: 0, stage: 'stage1_required' };
      mockFindOrCreate.mockResolvedValue(doc);

      const res = await request(app, 'GET', '/api/firmfacts/me');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.firmFacts).toBeDefined();
      expect(res.body.firmFacts.completionPercentage).toBe(0);
    });
  });

  describe('GET /api/firmfacts/me/completion', () => {
    it('returns completion data with missing fields', async () => {
      const doc = {
        vendorId: VENDOR_A,
        completionPercentage: 33,
        stage: 'stage2_recommended',
        completionByStage: { stage1: 100, stage2: 20, stage3: 0 },
        isStage1Complete: () => true,
        getMissingFields: (stage) => stage === 'stage1' ? [] : ['stage2.formalComplaintsThisYear'],
      };
      mockFindOrCreate.mockResolvedValue(doc);

      const res = await request(app, 'GET', '/api/firmfacts/me/completion');

      expect(res.status).toBe(200);
      expect(res.body.percentage).toBe(33);
      expect(res.body.stage1Complete).toBe(true);
      expect(res.body.missingFields.stage1).toEqual([]);
      expect(res.body.missingFields.stage2).toContain('stage2.formalComplaintsThisYear');
    });
  });

  describe('PUT /api/firmfacts/me', () => {
    it('returns updated firmFacts', async () => {
      const doc = {
        vendorId: VENDOR_A,
        stage1: {
          regulatoryNumber: { value: null, filledAt: null, source: null },
          transactionCountLastYear: { value: null, filledAt: null, source: null },
          typicalAllInCost: { value: null, filledAt: null, source: null },
        },
        save: vi.fn().mockResolvedValue(true),
      };
      mockFindOrCreate.mockResolvedValue(doc);

      const res = await request(app, 'PUT', '/api/firmfacts/me', {
        body: { 'stage1.regulatoryNumber': { value: '654321', source: 'verified_register' } },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(doc.save).toHaveBeenCalled();
    });
  });
});
