import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_A = new mongoose.Types.ObjectId();

// Track what the mock doc receives
let mockDoc;

const mockFindOrCreate = vi.fn();
const mockResolveFieldGroup = vi.fn();

vi.mock('../../models/FirmFacts.js', () => {
  return {
    STAGE1_PATHS: ['stage1.regulatoryNumber', 'stage1.transactionCountLastYear', 'stage1.typicalAllInCost'],
    STAGE2_PATHS: [],
    FIELD_GROUPS: ['identity', 'stage1', 'stage2', 'costs', 'process', 'authority', 'mistakes', 'rights', 'expertise', 'brandIdentity'],
    isFilled: (f) => f && f.value !== null && f.value !== undefined && !(typeof f.value === 'string' && f.value.trim() === ''),
    default: {
      findOrCreateForVendor: (...args) => mockFindOrCreate(...args),
      resolveFieldGroup: (...args) => mockResolveFieldGroup(...args),
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

function createMockDoc() {
  return {
    vendorId: VENDOR_A,
    identity: {
      firmName: { value: null, filledAt: null, source: null },
      city: { value: null, filledAt: null, source: null },
      vendorType: { value: null, filledAt: null, source: null },
      primarySpecialism: { value: null, filledAt: null, source: null },
      yearEstablished: { value: null, filledAt: null, source: null },
    },
    stage1: {
      regulatoryNumber: { value: null, filledAt: null, source: null },
      transactionCountLastYear: { value: null, filledAt: null, source: null },
      typicalAllInCost: { value: null, filledAt: null, source: null },
    },
    stage2: {
      toneOfVoice: { value: null, filledAt: null, source: null },
      clientTypes: { value: null, filledAt: null, source: null },
      brandKeywords: { value: null, filledAt: null, source: null },
      uniqueSellingPoints: { value: null, filledAt: null, source: null },
      formalComplaintsThisYear: { value: null, filledAt: null, source: null },
    },
    expertise: {
      totalSolicitorCount: { value: null, filledAt: null, source: null },
    },
    brandIdentity: {
      awards: { value: null, filledAt: null, source: null },
    },
    save: vi.fn().mockResolvedValue(true),
    completionPercentage: 0,
  };
}

describe('PUT /api/firmfacts/me — envelope format fix', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockDoc = createMockDoc();
    mockFindOrCreate.mockResolvedValue(mockDoc);
  });

  it('flat envelope: updates stage1 field via fieldName', async () => {
    mockResolveFieldGroup.mockReturnValue('stage1');

    const res = await request(app, 'PUT', '/api/firmfacts/me', {
      body: { fieldName: 'transactionCountLastYear', value: 247, source: 'self' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fieldsUpdated).toContain('stage1.transactionCountLastYear');
    expect(res.body.fieldsSkipped).toHaveLength(0);
    expect(mockDoc.stage1.transactionCountLastYear.value).toBe(247);
    expect(mockDoc.save).toHaveBeenCalled();
  });

  it('flat envelope: updates stage2 brand field via fieldName', async () => {
    mockResolveFieldGroup.mockReturnValue('stage2');

    const res = await request(app, 'PUT', '/api/firmfacts/me', {
      body: { fieldName: 'toneOfVoice', value: 'formal', source: 'self' },
    });

    expect(res.status).toBe(200);
    expect(res.body.fieldsUpdated).toContain('stage2.toneOfVoice');
    expect(mockDoc.stage2.toneOfVoice.value).toBe('formal');
  });

  it('flat envelope: unknown fieldName goes to fieldsSkipped', async () => {
    mockResolveFieldGroup.mockReturnValue(null);

    const res = await request(app, 'PUT', '/api/firmfacts/me', {
      body: { fieldName: 'nonExistentField', value: 'test', source: 'self' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fieldsUpdated).toHaveLength(0);
    expect(res.body.fieldsSkipped).toContain('nonExistentField');
  });

  it('nested format still works (backwards compat)', async () => {
    const res = await request(app, 'PUT', '/api/firmfacts/me', {
      body: { 'stage1.transactionCountLastYear': { value: 500, source: 'self' } },
    });

    expect(res.status).toBe(200);
    expect(res.body.fieldsUpdated).toContain('stage1.transactionCountLastYear');
    expect(mockDoc.stage1.transactionCountLastYear.value).toBe(500);
  });

  it('nested format: invalid path goes to fieldsSkipped', async () => {
    const res = await request(app, 'PUT', '/api/firmfacts/me', {
      body: { 'badgroup.badfield': { value: 'x', source: 'self' } },
    });

    expect(res.status).toBe(200);
    expect(res.body.fieldsUpdated).toHaveLength(0);
    expect(res.body.fieldsSkipped).toContain('badgroup.badfield');
  });

  it('response includes fieldsUpdated and fieldsSkipped arrays', async () => {
    mockResolveFieldGroup.mockReturnValue('stage1');

    const res = await request(app, 'PUT', '/api/firmfacts/me', {
      body: { fieldName: 'regulatoryNumber', value: '654321', source: 'verified_register' },
    });

    expect(res.body).toHaveProperty('fieldsUpdated');
    expect(res.body).toHaveProperty('fieldsSkipped');
    expect(Array.isArray(res.body.fieldsUpdated)).toBe(true);
    expect(Array.isArray(res.body.fieldsSkipped)).toBe(true);
  });
});
