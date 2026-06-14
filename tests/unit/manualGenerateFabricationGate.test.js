import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-for-vitest';
process.env.ANTHROPIC_API_KEY = 'test-key';

import mongoose from 'mongoose';

const VENDOR_ID = new mongoose.Types.ObjectId().toString();

// ─── Mock Anthropic SDK (dynamic import in route handler) ──────
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    this.messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

// ─── Mock vendorAuth middleware ────────────────────────────────
vi.mock('../../middleware/vendorAuth.js', () => ({
  default: (req, _res, next) => {
    req.vendorId = req.headers['x-test-vendor-id'] || VENDOR_ID;
    req.vendor = { id: req.vendorId, vendorId: req.vendorId };
    next();
  },
}));

// ─── Mock Vendor model ────────────────────────────────────────
const mockVendor = {
  _id: VENDOR_ID,
  tier: 'pro',
  vendorType: 'solicitor',
  company: 'Smith & Partners',
  slug: 'smith-and-partners',
  location: { city: 'Cardiff' },
};

vi.mock('../../models/Vendor.js', () => {
  const findById = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockVendor),
    }),
  }));
  function V() {}
  V.findById = findById;
  V.find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  });
  V.updateOne = vi.fn().mockResolvedValue({});
  return { default: V };
});

// ─── Mock VendorPost model ────────────────────────────────────
vi.mock('../../models/VendorPost.js', () => {
  function MockPost(data) { Object.assign(this, data); }
  MockPost.find = vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
  MockPost.countDocuments = vi.fn().mockResolvedValue(0);
  return { default: MockPost };
});

// ─── Mock firmContext (avoids DB queries) ──────────────────────
vi.mock('../../services/contentPlanner/firmContext.js', () => ({
  getFirmContext: vi.fn().mockResolvedValue({
    company: 'Smith & Partners',
    vendorType: 'solicitor',
    location: { city: 'Cardiff' },
  }),
  renderFirmContextBlock: vi.fn().mockReturnValue(
    '<firm_context>\n{"company":"Smith & Partners","vendorType":"solicitor"}\n</firm_context>'
  ),
}));

// ─── Mock fabrication review (Haiku API) ──────────────────────
// detectPossibleFabrication from writerGuards.js is NOT mocked —
// it's a pure regex function and we want to test it for real.
const mockReviewDraft = vi.fn();
vi.mock('../../services/contentPlanner/fabricationReview.js', () => ({
  reviewDraftForFabrication: (...args) => mockReviewDraft(...args),
}));

// ─── Import router under test ─────────────────────────────────
const { default: express } = await import('express');
const { default: vendorPostRoutes } = await import('../../routes/vendorPostRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vendors', vendorPostRoutes);
  return app;
}

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

// ─── Helpers ──────────────────────────────────────────────────
function llmResponse(overrides = {}) {
  const draft = {
    title: 'How Conveyancing Works in Cardiff in 2026',
    body: '## Direct Answer\n\nConveyancing is the legal process of transferring property ownership from seller to buyer. SRA-registered solicitors handle this process.\n\n## How the Process Works in Cardiff in 2026\n\nThe conveyancing process involves several stages, from initial instruction through to completion and registration with HM Land Registry.',
    linkedInText: 'We just published a guide on conveyancing in Cardiff.',
    facebookText: 'Thinking about buying or selling? Here is what you need to know.',
    placeholderCount: 0,
    topicSuitabilityFlag: 'ok',
    agentReportedPlaceholderCount: 0,
    ...overrides,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(draft) }],
    usage: { input_tokens: 2000, output_tokens: 1500 },
  };
}

function generateUrl() {
  return `/api/vendors/${VENDOR_ID}/posts/generate`;
}

function generateHeaders() {
  return { 'x-test-vendor-id': VENDOR_ID };
}

// ─── Tests ────────────────────────────────────────────────────
describe('Manual generate route — fabrication gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 422 when draft body contains a fabricated attributed stat (regex gate)', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      title: 'Understanding SRA Regulations in 2026',
      body: '## Direct Answer\n\nAccording to SRA data, 73% of solicitors in England and Wales now maintain digital client accounts. This represents a significant shift in legal practice.',
    }));

    const app = buildApp();
    const res = await request(app, 'POST', generateUrl(), {
      headers: generateHeaders(),
      body: { topic: 'SRA regulations for solicitors' },
    });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('fabricated');
    expect(res.body.fabricationFlags).toBeDefined();
    expect(res.body.fabricationFlags.length).toBeGreaterThan(0);
    expect(res.body.fabricationFlags[0].body).toBe('SRA');
    // Semantic review should NOT be called — regex blocked first
    expect(mockReviewDraft).not.toHaveBeenCalled();
  });

  it('returns 200 with clean draft when no fabrication detected', async () => {
    mockCreate.mockResolvedValue(llmResponse());

    mockReviewDraft.mockResolvedValue({
      verdict: 'pass',
      qualityScore: 8,
      fabricatedAttributions: [],
      firmClaimsNotInContext: [],
    });

    const app = buildApp();
    const res = await request(app, 'POST', generateUrl(), {
      headers: generateHeaders(),
      body: { topic: 'How conveyancing works in Cardiff' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toBe('How Conveyancing Works in Cardiff in 2026');
    expect(res.body.body).toContain('SRA-registered');
    expect(res.body.qualityScore).toBe(8);
    expect(res.body.topicSuitabilityFlag).toBe('ok');
    // Semantic review was called (regex passed)
    expect(mockReviewDraft).toHaveBeenCalledOnce();
  });

  it('returns 422 when semantic review verdict is fail (Haiku gate)', async () => {
    // Body is clean for regex (no attributed stats) but contains firm claims
    mockCreate.mockResolvedValue(llmResponse({
      body: '## Direct Answer\n\nSmith & Partners has completed over 500 conveyancing transactions this year with a 98% client satisfaction rate across all property types.',
    }));

    mockReviewDraft.mockResolvedValue({
      verdict: 'fail',
      qualityScore: 3,
      fabricatedAttributions: [],
      firmClaimsNotInContext: [
        { claim: 'completed over 500 conveyancing transactions' },
      ],
    });

    const app = buildApp();
    const res = await request(app, 'POST', generateUrl(), {
      headers: generateHeaders(),
      body: { topic: 'Best solicitors in Cardiff' },
    });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('semantic review failed');
    expect(res.body.firmClaimsNotInContext).toHaveLength(1);
    expect(res.body.qualityScore).toBe(3);
  });

  it('returns 422 when semantic review throws (fail-closed)', async () => {
    mockCreate.mockResolvedValue(llmResponse());

    mockReviewDraft.mockRejectedValue(new Error('Anthropic API timeout'));

    const app = buildApp();
    const res = await request(app, 'POST', generateUrl(), {
      headers: generateHeaders(),
      body: { topic: 'Guide to conveyancing' },
    });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('fail-closed');
  });
});
