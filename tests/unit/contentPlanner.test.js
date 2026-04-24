/**
 * v7 content planner — unit tests.
 *
 * Covers:
 *   - PILLAR_LIBRARIES / VERTICAL_ENTITIES / LINKEDIN_HOOK_TYPES export
 *     (load without throwing; all four supported verticals present)
 *   - buildUserPrompt with a pillar spec
 *   - buildUserPrompt without a pillar spec (generic v7 path)
 *   - Generate handler rejects missing topic with 400
 *   - Generate handler rejects invalid pillar with 400
 *
 * Does not make live LLM calls. Does not hit a live DB. Both the Vendor
 * lookup and the anthropic client are stubbed.
 */

// ESM imports are hoisted, so setting process.env at file-top would run
// after vendorAuth's import-time JWT_SECRET check. We set env first, then
// dynamically import anything that transitively needs it — top-level
// await is supported by vitest.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-v7-planner';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import {
  PILLAR_LIBRARIES,
  VERTICAL_ENTITIES,
  LINKEDIN_HOOK_TYPES,
  UNIVERSAL_RULES,
} from '../../services/contentPlanner/pillarLibraries.js';

// Dynamic imports — env is set before these resolve.
const routeModule = await import('../../routes/vendorPostRoutes.js');
const vendorPostRoutes = routeModule.default;
const buildUserPrompt = routeModule.buildUserPrompt;
const { default: Vendor } = await import('../../models/Vendor.js');

describe('pillarLibraries exports', () => {
  it('loads without throwing and exposes all four vendor-type keys', () => {
    expect(PILLAR_LIBRARIES).toBeDefined();
    expect(PILLAR_LIBRARIES.solicitor).toBeDefined();
    expect(PILLAR_LIBRARIES.accountant).toBeDefined();
    expect(PILLAR_LIBRARIES['mortgage-advisor']).toBeDefined();
    expect(PILLAR_LIBRARIES['estate-agent']).toBeDefined();
  });

  it('exports VERTICAL_ENTITIES, LINKEDIN_HOOK_TYPES, UNIVERSAL_RULES', () => {
    expect(VERTICAL_ENTITIES).toBeDefined();
    expect(LINKEDIN_HOOK_TYPES).toBeDefined();
    expect(UNIVERSAL_RULES).toBeDefined();
  });
});

describe('buildUserPrompt', () => {
  it('returns a string containing the topic for a pillar-backed spec', () => {
    const out = buildUserPrompt({
      topic: 'Fixed-fee conveyancing for first-time buyers',
      verticalLabel: 'solicitor',
      vendorName: 'Smith & Co',
      vendorCity: 'London',
      pillarSpec: {
        pillarName: 'Costs & fees',
        tactic: 'Quote a specific figure up front',
        mustInclude: ['Specific price example', 'Comparison against market'],
        namedEntities: ['Land Registry', 'HMRC Stamp Duty'],
        primaryDataHook: 'Our average conveyancing fee in 2025 is £[X]',
        wordCount: 1500,
        primaryAIQuery: 'how much does conveyancing cost',
        secondaryQueries: ['conveyancing fees 2025', 'average solicitor fees'],
      },
      vendorTypeEntities: ['SRA', 'CQS', 'Lexcel'],
      linkedInHookType: 'data',
    });
    expect(typeof out).toBe('string');
    expect(out).toContain('Fixed-fee conveyancing for first-time buyers');
    expect(out).toContain('Costs & fees');
    expect(out).toContain('1500 words');
    expect(out).toContain('data');
    expect(out).toContain('Land Registry');
    expect(out).toContain('Smith & Co');
    expect(out).toContain('based in London');
  });

  it('returns a string without "undefined" when no pillar spec is provided', () => {
    const out = buildUserPrompt({
      topic: 'Recent changes to stamp duty',
      verticalLabel: 'solicitor',
      pillarSpec: null,
      vendorTypeEntities: ['SRA'],
    });
    expect(typeof out).toBe('string');
    expect(out).not.toContain('undefined');
    expect(out).toContain('Recent changes to stamp duty');
    // Falls back to generic "a solicitor firm" when vendorName is absent.
    expect(out).toContain('a solicitor firm');
    // No vendorCity → no "based in" suffix.
    expect(out).not.toContain('based in');
  });

  it('uses the generic "opinion" linkedIn hook when none is specified', () => {
    const out = buildUserPrompt({
      topic: 'Any topic',
      verticalLabel: 'solicitor',
      pillarSpec: null,
      vendorTypeEntities: [],
    });
    expect(out).toContain('opinion');
  });
});

// ─── Handler integration ────────────────────────────────────────────────

describe('POST /api/vendors/:vendorId/posts/generate — validation', () => {
  let server;
  let baseUrl;
  let token;
  let vendorId;

  const paidVendor = {
    _id: null, // filled in beforeAll
    company: 'Test Firm LLP',
    vendorType: 'solicitor',
    tier: 'pro',
    status: 'active',
    email: 'test@example.com',
    name: 'Test',
    companyName: 'Test Firm LLP',
    location: { city: 'London' },
  };

  beforeAll(async () => {
    vendorId = new mongoose.Types.ObjectId();
    paidVendor._id = vendorId;
    token = jwt.sign({ vendorId: String(vendorId) }, process.env.JWT_SECRET);

    // Stub Vendor.findById so the handler can resolve the authed vendor
    // without a DB. Returns a chainable object supporting both
    // .select().lean() (used in the handler) and .lean() (used in
    // vendorAuth's own lookup).
    vi.spyOn(Vendor, 'findById').mockImplementation(() => ({
      select: () => ({ lean: async () => ({ ...paidVendor }) }),
      lean: async () => ({ ...paidVendor }),
    }));

    // Silence the fire-and-forget last-activity updater vendorAuth runs
    // in production. The handler path doesn't depend on its result.
    vi.spyOn(Vendor, 'findByIdAndUpdate').mockImplementation(() => ({
      catch: () => {},
    }));

    const app = express();
    app.use(express.json());
    app.use('/api/vendors', vendorPostRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    vi.restoreAllMocks();
  });

  async function postGenerate(body) {
    const res = await fetch(`${baseUrl}/api/vendors/${vendorId}/posts/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  it('rejects missing topic with 400', async () => {
    const r = await postGenerate({ stats: 'some stats' });
    expect(r.status).toBe(400);
    expect(r.body?.error).toMatch(/topic is required/i);
  });

  it('rejects empty-string topic with 400', async () => {
    const r = await postGenerate({ topic: '   ' });
    expect(r.status).toBe(400);
    expect(r.body?.error).toMatch(/topic is required/i);
  });

  it('rejects an invalid pillar id with 400', async () => {
    // PILLAR_LIBRARIES.solicitor is [] in scaffolding, so any pillar id
    // routes to "Invalid pillar: <id>". Once content lands, this test
    // still passes for a truly-nonsense pillar id like "not-a-pillar".
    const r = await postGenerate({
      topic: 'Anything',
      pillar: 'not-a-pillar',
    });
    expect(r.status).toBe(400);
    expect(r.body?.error).toMatch(/invalid pillar|no pillar library/i);
  });
});
