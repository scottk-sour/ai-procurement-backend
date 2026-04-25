/**
 * Onboarding checklist tracking — tests for the PATCH endpoint, the
 * profile-completeness helper, and the post-generate auto-detection.
 *
 * No live LLM calls and no live DB. Vendor.findById is stubbed via
 * vi.spyOn; the Anthropic SDK is mocked via vi.mock so the
 * post-generate handler completes its happy path without network.
 *
 * Harness mirrors tests/unit/contentLibrary.test.js: env set first,
 * dynamic imports of route files, in-process Express via fetch, real
 * JWT signed against a throwaway secret.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-onboarding';
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'test-admin-secret';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key';
// vendorUploadRoutes transitively imports a logger that requires
// the standard backend env block. Set throwaway values for tests.
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.PORT = process.env.PORT || '0';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// Mock the Anthropic SDK before any import that pulls it in. The
// generate handler does `await import('@anthropic-ai/sdk')` inside
// the request, but vi.mock is hoisted and intercepts the dynamic
// import too.
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn(async () => ({
    content: [{
      type: 'text',
      text: JSON.stringify({
        title: 'A test post',
        body: 'Body of the test post.',
        linkedInText: 'LinkedIn variant.',
        facebookText: 'Facebook variant.',
      }),
    }],
  }));
  class Anthropic {
    constructor() {
      this.messages = { create: mockCreate };
    }
  }
  return { default: Anthropic };
});

// Dynamic imports — env set first so vendorAuth's JWT_SECRET assert passes.
const vendorUploadRoutes = (await import('../../routes/vendorUploadRoutes.js')).default;
const { checkProfileCompleteness, ONBOARDING_TICKABLE_ITEMS, ONBOARDING_AUTO_DETECTED_ITEMS } =
  await import('../../routes/vendorUploadRoutes.js');
const vendorPostRoutes = (await import('../../routes/vendorPostRoutes.js')).default;
const { default: Vendor } = await import('../../models/Vendor.js');

// ───────────────────────── helpers ────────────────────────────────────

const authedVendorId = new mongoose.Types.ObjectId();
const otherVendorId = new mongoose.Types.ObjectId();

let currentVendor;
let updateOneCalls;

function defaultVendor(overrides = {}) {
  return {
    _id: authedVendorId,
    company: 'Test Solicitors LLP',
    vendorType: 'solicitor',
    tier: 'pro',
    status: 'active',
    email: 'test@example.com',
    name: 'Test',
    companyName: 'Test Solicitors LLP',
    location: { city: 'Manchester' },
    practiceAreas: ['Conveyancing'],
    description: 'A long-enough description so that the profile-completeness threshold treats this vendor as complete.',
    onboardingChecklist: {
      profileComplete: false,
      firstProductAdded: false,
      firstAuditRun: false,
      schemaCallScheduled: false,
      firstPillarPostGenerated: false,
      firstPrimaryDataAdded: false,
      firstLiveAITestRun: false,
    },
    ...overrides,
  };
}

let server;
let baseUrl;
let token;

beforeAll(async () => {
  token = jwt.sign({ vendorId: String(authedVendorId) }, process.env.JWT_SECRET);

  vi.spyOn(Vendor, 'findById').mockImplementation(() => {
    // Mongoose Query objects are thenable, and any chain method like
    // .select(), .lean(), .populate() also returns a thenable. The
    // route awaits both `findById()` and `findById().select(...)`, so
    // every link in the chain has to resolve to the vendor.
    const value = () => ({ ...currentVendor });
    const chain = {
      lean: async () => value(),
      exec: async () => value(),
      then: (resolve) => resolve(value()),
      select: () => chain,
      populate: () => chain,
    };
    return chain;
  });
  vi.spyOn(Vendor, 'findByIdAndUpdate').mockImplementation((_id, update) => {
    const $set = update?.$set || {};
    for (const [k, v] of Object.entries($set)) {
      if (k.startsWith('onboardingChecklist.')) {
        const field = k.slice('onboardingChecklist.'.length);
        currentVendor.onboardingChecklist = currentVendor.onboardingChecklist || {};
        currentVendor.onboardingChecklist[field] = v;
      }
    }
    return { lean: async () => ({ ...currentVendor }), then: (r) => r({ ...currentVendor }) };
  });
  vi.spyOn(Vendor, 'updateOne').mockImplementation(async (filter, update) => {
    updateOneCalls.push({ filter, update });
    // Apply if filter matches (we only test the $or "not yet set" filter shape).
    const id = filter._id;
    if (String(id) !== String(currentVendor._id)) return { matchedCount: 0, modifiedCount: 0 };
    const orClauses = filter.$or || [];
    if (orClauses.length) {
      // Each clause looks like { 'onboardingChecklist.X': { $ne: true } } or { ...: { $exists: false } }
      const clauseField = Object.keys(orClauses[0])[0];
      const fieldName = clauseField.split('.').pop();
      const currentValue = currentVendor.onboardingChecklist?.[fieldName];
      if (currentValue === true) return { matchedCount: 0, modifiedCount: 0 };
    }
    const $set = update?.$set || {};
    for (const [k, v] of Object.entries($set)) {
      if (k.startsWith('onboardingChecklist.')) {
        const field = k.slice('onboardingChecklist.'.length);
        currentVendor.onboardingChecklist = currentVendor.onboardingChecklist || {};
        currentVendor.onboardingChecklist[field] = v;
      }
    }
    return { matchedCount: 1, modifiedCount: 1 };
  });
  // vendorAuth fire-and-forget last-activity updater.
  vi.spyOn(Vendor.prototype, 'save').mockImplementation(async function () { return this; });

  const app = express();
  app.use(express.json());
  app.use('/api/vendors', vendorUploadRoutes);
  app.use('/api/vendors', vendorPostRoutes);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.restoreAllMocks();
});

beforeEach(() => {
  currentVendor = defaultVendor();
  updateOneCalls = [];
});

async function patch(path, body, { withToken = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (withToken) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH', headers, body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function postGenerate(body) {
  const res = await fetch(`${baseUrl}/api/vendors/${authedVendorId}/posts/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

// Allow the post-generate fire-and-forget checklist write to complete
// before the test asserts on it.
const tick = () => new Promise((resolve) => setImmediate(resolve));

// ───────────────────────── tests ──────────────────────────────────────

describe('PATCH /api/vendors/:vendorId/onboarding-checklist', () => {
  it('returns 401 without auth', async () => {
    const r = await patch(`/api/vendors/${authedVendorId}/onboarding-checklist`,
      { item: 'schemaCallScheduled' }, { withToken: false });
    expect(r.status).toBe(401);
  });

  it('returns 403 cross-vendor (req.vendorId differs from :vendorId)', async () => {
    const r = await patch(`/api/vendors/${otherVendorId}/onboarding-checklist`,
      { item: 'schemaCallScheduled' });
    expect(r.status).toBe(403);
    expect(r.body?.error).toMatch(/not authorised/i);
  });

  it('returns 400 for an unknown item', async () => {
    const r = await patch(`/api/vendors/${authedVendorId}/onboarding-checklist`,
      { item: 'somethingMadeUp' });
    expect(r.status).toBe(400);
    expect(r.body?.error).toMatch(/unknown checklist item/i);
  });

  it('returns 400 for an auto-detected item (firstPillarPostGenerated)', async () => {
    const r = await patch(`/api/vendors/${authedVendorId}/onboarding-checklist`,
      { item: 'firstPillarPostGenerated' });
    expect(r.status).toBe(400);
    expect(r.body?.error).toMatch(/auto-detected/i);
  });

  it('returns 200 and ticks a valid item with timestamp', async () => {
    const r = await patch(`/api/vendors/${authedVendorId}/onboarding-checklist`,
      { item: 'schemaCallScheduled' });
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(r.body?.onboardingChecklist?.schemaCallScheduled).toBe(true);
    expect(r.body?.onboardingChecklist?.schemaCallScheduledAt).toBeTruthy();
  });

  it('is idempotent — second tick does not update the timestamp', async () => {
    // First tick.
    const r1 = await patch(`/api/vendors/${authedVendorId}/onboarding-checklist`,
      { item: 'schemaCallScheduled' });
    expect(r1.status).toBe(200);
    const firstAt = r1.body.onboardingChecklist.schemaCallScheduledAt;

    // Second tick on the same item.
    const r2 = await patch(`/api/vendors/${authedVendorId}/onboarding-checklist`,
      { item: 'schemaCallScheduled' });
    expect(r2.status).toBe(200);
    expect(r2.body.onboardingChecklist.schemaCallScheduled).toBe(true);
    expect(r2.body.onboardingChecklist.schemaCallScheduledAt).toBe(firstAt);
  });
});

describe('checkProfileCompleteness', () => {
  it('returns false for an incomplete vendor (description too short)', () => {
    const v = defaultVendor({ description: 'too short' });
    expect(checkProfileCompleteness(v)).toBe(false);
  });

  it('returns false when vendor has no specialism field set', () => {
    const v = defaultVendor({
      practiceAreas: [], industrySpecialisms: [], specialisms: [],
      businessProfile: { specializations: [] },
    });
    expect(checkProfileCompleteness(v)).toBe(false);
  });

  it('returns false when company is missing', () => {
    const v = defaultVendor({ company: '' });
    expect(checkProfileCompleteness(v)).toBe(false);
  });

  it('returns true when all five conditions are met (practiceAreas)', () => {
    const v = defaultVendor();
    expect(checkProfileCompleteness(v)).toBe(true);
  });

  it('returns true via industrySpecialisms when practiceAreas absent', () => {
    const v = defaultVendor({ practiceAreas: [], industrySpecialisms: ['Tech'] });
    expect(checkProfileCompleteness(v)).toBe(true);
  });

  it('returns true via businessProfile.specializations when both arrays absent', () => {
    const v = defaultVendor({
      practiceAreas: [],
      industrySpecialisms: [],
      businessProfile: { specializations: ['Healthcare'] },
    });
    expect(checkProfileCompleteness(v)).toBe(true);
  });
});

describe('post-generate auto-detection', () => {
  it('flags firstPillarPostGenerated when the request includes a pillar', async () => {
    const r = await postGenerate({
      topic: 'How much does conveyancing cost in Manchester in 2026?',
      pillar: 'costs-fees',
      topicIndex: 0,
    });
    expect(r.status).toBe(200);
    await tick();
    expect(currentVendor.onboardingChecklist.firstPillarPostGenerated).toBe(true);
    expect(currentVendor.onboardingChecklist.firstPillarPostGeneratedAt).toBeInstanceOf(Date);
  });

  it('does NOT flag firstPrimaryDataAdded when primaryData is empty / whitespace', async () => {
    const r = await postGenerate({
      topic: 'A topic with no primary data',
      pillar: 'costs-fees',
      primaryData: '   ',
    });
    expect(r.status).toBe(200);
    await tick();
    expect(currentVendor.onboardingChecklist.firstPrimaryDataAdded).toBe(false);
  });

  it('flags firstPrimaryDataAdded when primaryData is non-empty', async () => {
    const r = await postGenerate({
      topic: 'A topic with primary data',
      pillar: 'costs-fees',
      primaryData: 'Our average conveyancing fee in 2025 was £950 across 247 cases.',
    });
    expect(r.status).toBe(200);
    await tick();
    expect(currentVendor.onboardingChecklist.firstPrimaryDataAdded).toBe(true);
    expect(currentVendor.onboardingChecklist.firstPrimaryDataAddedAt).toBeInstanceOf(Date);
  });

  it('is idempotent — already-true firstPillarPostGenerated keeps its original timestamp', async () => {
    // Pre-stamp the flag on the in-memory vendor.
    const originalAt = new Date('2026-01-01T00:00:00Z');
    currentVendor.onboardingChecklist.firstPillarPostGenerated = true;
    currentVendor.onboardingChecklist.firstPillarPostGeneratedAt = originalAt;

    const r = await postGenerate({
      topic: 'Another pillar post',
      pillar: 'process-timelines',
    });
    expect(r.status).toBe(200);
    await tick();

    // Flag stays true; timestamp must not have been overwritten.
    expect(currentVendor.onboardingChecklist.firstPillarPostGenerated).toBe(true);
    expect(currentVendor.onboardingChecklist.firstPillarPostGeneratedAt).toBe(originalAt);

    // The conditional updateOne should have been issued, but the
    // mock's filter check should have rejected it — modifiedCount 0.
    const pillarWrite = updateOneCalls.find((c) =>
      Object.keys(c.update?.$set || {}).includes('onboardingChecklist.firstPillarPostGenerated'));
    expect(pillarWrite).toBeTruthy();
  });

  it('exposes ONBOARDING_TICKABLE_ITEMS and ONBOARDING_AUTO_DETECTED_ITEMS as the four-and-three split', () => {
    expect(ONBOARDING_TICKABLE_ITEMS.size).toBe(3);
    expect(ONBOARDING_AUTO_DETECTED_ITEMS.size).toBe(4);
    for (const a of ONBOARDING_TICKABLE_ITEMS) {
      expect(ONBOARDING_AUTO_DETECTED_ITEMS.has(a)).toBe(false);
    }
  });
});
