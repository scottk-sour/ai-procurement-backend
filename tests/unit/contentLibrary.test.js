/**
 * GET /api/content-library — route tests.
 *
 * Covers the four public expectations the frontend depends on:
 *   - Auth is enforced (no token → 401)
 *   - Tier gate is enforced (free → 403)
 *   - Unsupported vendor types reject with 400 (office-equipment,
 *     financial-advisor, insurance-broker)
 *   - All four supported vendor types get a full 6-pillar response
 *   - Placeholder resolution behaves: {city} / {firmName} / {year}
 *     resolve; {N} / {X} and other vendor-fill placeholders stay
 *     literal
 *
 * Test harness mirrors tests/unit/contentPlanner.test.js: env set
 * first via top-level await, Vendor.findById stubbed, real JWT
 * signed with a throwaway secret, Express app spun up in-process
 * and hit via fetch.
 */

// ESM imports are hoisted, so setting env at file-top would run after
// vendorAuth's import-time JWT_SECRET check. Set env before the dynamic
// import of the route file.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-content-library';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// Pure module — no env dependency.
import { PILLAR_LIBRARIES } from '../../services/contentPlanner/pillarLibraries.js';

// Dynamic imports — env is set before these resolve.
const routeModule = await import('../../routes/contentLibraryRoutes.js');
const contentLibraryRoutes = routeModule.default;
const { resolvePlaceholders } = routeModule;
const { default: Vendor } = await import('../../models/Vendor.js');

describe('GET /api/content-library', () => {
  let server;
  let baseUrl;
  let token;
  let vendorId;

  // Mutable per-test; beforeAll stubs Vendor.findById to return this.
  let currentVendor;

  const defaultSolicitor = () => ({
    _id: vendorId,
    company: 'Test Solicitors LLP',
    vendorType: 'solicitor',
    tier: 'pro',
    status: 'active',
    email: 'test@example.com',
    name: 'Test',
    companyName: 'Test Solicitors LLP',
    location: { city: 'Manchester' },
    practiceAreas: ['Conveyancing'],
  });

  beforeAll(async () => {
    vendorId = new mongoose.Types.ObjectId();
    currentVendor = defaultSolicitor();
    token = jwt.sign({ vendorId: String(vendorId) }, process.env.JWT_SECRET);

    vi.spyOn(Vendor, 'findById').mockImplementation(() => ({
      select: () => ({ lean: async () => ({ ...currentVendor, _id: vendorId }) }),
      // vendorAuth itself calls .select().lean() too
      lean: async () => ({ ...currentVendor, _id: vendorId }),
    }));
    vi.spyOn(Vendor, 'findByIdAndUpdate').mockImplementation(() => ({
      catch: () => {},
    }));

    const app = express();
    app.use(express.json());
    app.use('/api/content-library', contentLibraryRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    vi.restoreAllMocks();
  });

  async function fetchLibrary({ withToken = true } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (withToken) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/api/content-library`, { method: 'GET', headers });
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, body };
  }

  it('returns 401 without auth', async () => {
    currentVendor = defaultSolicitor();
    const r = await fetchLibrary({ withToken: false });
    expect(r.status).toBe(401);
  });

  it('returns 403 for free tier', async () => {
    currentVendor = { ...defaultSolicitor(), tier: 'free' };
    const r = await fetchLibrary();
    expect(r.status).toBe(403);
    expect(r.body?.error).toMatch(/paid plan/i);
  });

  it('returns 400 for unsupported vendor type (office-equipment)', async () => {
    currentVendor = { ...defaultSolicitor(), vendorType: 'office-equipment' };
    const r = await fetchLibrary();
    expect(r.status).toBe(400);
    expect(r.body?.error).toMatch(/not available for vendor type/i);
    expect(r.body?.error).toMatch(/office-equipment/);
  });

  it('returns 200 with 6 pillars for a solicitor vendor', async () => {
    currentVendor = defaultSolicitor();
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(r.body?.vendorType).toBe('solicitor');
    expect(Array.isArray(r.body?.pillars)).toBe(true);
    expect(r.body.pillars).toHaveLength(6);
    expect(r.body.pillars.map((p) => p.id)).toEqual([
      'costs-fees', 'process-timelines', 'regulatory-authority',
      'common-mistakes', 'client-rights', 'firm-expertise',
    ]);
    // Each topic carries its parent pillar id.
    for (const pillar of r.body.pillars) {
      for (const topic of pillar.topics) {
        expect(topic.pillar).toBe(pillar.id);
      }
    }
    // Response includes the shared content-planner scaffolding.
    expect(r.body.linkedInHookTypes).toBeDefined();
    expect(r.body.linkedInHookTypes.opinion).toBeDefined();
    expect(r.body.universalRules).toBeDefined();
    expect(r.body.universalRules.structure).toBeTruthy();
  });

  it('returns 200 with 6 pillars for an accountant vendor', async () => {
    currentVendor = {
      ...defaultSolicitor(),
      vendorType: 'accountant',
      company: 'Ledger & Co',
      practiceAreas: undefined,
    };
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    expect(r.body?.vendorType).toBe('accountant');
    expect(r.body.pillars).toHaveLength(6);
  });

  it('returns 200 with 6 pillars for a mortgage-advisor vendor', async () => {
    currentVendor = {
      ...defaultSolicitor(),
      vendorType: 'mortgage-advisor',
      company: 'Broker Group',
      practiceAreas: undefined,
    };
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    expect(r.body?.vendorType).toBe('mortgage-advisor');
    expect(r.body.pillars).toHaveLength(6);
  });

  it('returns 200 with 6 pillars for an estate-agent vendor', async () => {
    currentVendor = {
      ...defaultSolicitor(),
      vendorType: 'estate-agent',
      company: 'Keys & Co',
      practiceAreas: undefined,
    };
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    expect(r.body?.vendorType).toBe('estate-agent');
    expect(r.body.pillars).toHaveLength(6);
  });

  it('resolves {city} in topic.title when vendor has location.city', async () => {
    currentVendor = {
      ...defaultSolicitor(),
      location: { city: 'Manchester' },
      practiceAreas: ['Conveyancing'],
    };
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    // solicitor-costs-1 title: 'How much does {specialism} cost in {city} in {year}?'
    const costs = r.body.pillars.find((p) => p.id === 'costs-fees');
    const topic1 = costs.topics.find((t) => t.id === 'solicitor-costs-1');
    expect(topic1.title).toContain('Manchester');
    expect(topic1.title).not.toContain('{city}');
    // {year} is also resolved to the current calendar year.
    expect(topic1.title).toContain(String(new Date().getFullYear()));
    expect(topic1.title).not.toContain('{year}');
  });

  it('falls back to "your city" in topic.title when vendor lacks location.city', async () => {
    currentVendor = {
      ...defaultSolicitor(),
      location: undefined,
      practiceAreas: undefined,
    };
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    const costs = r.body.pillars.find((p) => p.id === 'costs-fees');
    const topic1 = costs.topics.find((t) => t.id === 'solicitor-costs-1');
    expect(topic1.title).toContain('your city');
    expect(topic1.title).toContain('your main service area');
  });

  it('resolves {firmName} via the helper when vendor has company', () => {
    // No topic.title in the current library contains {firmName}, so we
    // exercise the helper directly to verify the substitution.
    const out = resolvePlaceholders(
      '{firmName} has handled cases since {year}.',
      { company: 'Smith & Co', location: { city: 'Leeds' } },
    );
    expect(out).toContain('Smith & Co');
    expect(out).not.toContain('{firmName}');
    expect(out).toContain(String(new Date().getFullYear()));
  });

  it('resolves {specialism} from practiceAreas (solicitor path)', async () => {
    currentVendor = {
      ...defaultSolicitor(),
      practiceAreas: ['Family Law'],
      industrySpecialisms: undefined,
    };
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    // solicitor-costs-1 title: 'How much does {specialism} cost in {city} in {year}?'
    const costs = r.body.pillars.find((p) => p.id === 'costs-fees');
    const topic1 = costs.topics.find((t) => t.id === 'solicitor-costs-1');
    expect(topic1.title).toContain('Family Law');
    expect(topic1.title).not.toContain('{specialism}');
  });

  it('resolves {specialism} from industrySpecialisms for accountants without practiceAreas', async () => {
    currentVendor = {
      ...defaultSolicitor(),
      vendorType: 'accountant',
      company: 'Ledger LLP',
      practiceAreas: undefined,
      industrySpecialisms: ['Hospitality'],
    };
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    // accountant-expertise-1 title: 'Why we specialise in {specialism} accountancy'
    const expertise = r.body.pillars.find((p) => p.id === 'firm-expertise');
    const topic1 = expertise.topics.find((t) => t.id === 'accountant-expertise-1');
    expect(topic1.title).toContain('Hospitality');
    expect(topic1.title).not.toContain('{specialism}');
  });

  it('resolves {specialism} from businessProfile.specializations when the primaries are absent', () => {
    const out = resolvePlaceholders(
      'Why we specialise in {specialism}',
      { businessProfile: { specializations: ['Technology'] } },
    );
    expect(out).toBe('Why we specialise in Technology');
  });

  it('follows the specialism fallback precedence: specialisms → practiceAreas → industrySpecialisms → businessProfile.specializations', () => {
    // Tier 1: top-level specialisms wins over everything.
    const allFields = {
      specialisms: ['From specialisms'],
      practiceAreas: ['From practiceAreas'],
      industrySpecialisms: ['From industrySpecialisms'],
      businessProfile: { specializations: ['From businessProfile'] },
    };
    expect(resolvePlaceholders('{specialism}', allFields)).toBe('From specialisms');

    // Tier 2: practiceAreas used when specialisms absent.
    expect(resolvePlaceholders('{specialism}', {
      practiceAreas: ['From practiceAreas'],
      industrySpecialisms: ['From industrySpecialisms'],
      businessProfile: { specializations: ['From businessProfile'] },
    })).toBe('From practiceAreas');

    // Tier 3: industrySpecialisms used when first two absent.
    expect(resolvePlaceholders('{specialism}', {
      industrySpecialisms: ['From industrySpecialisms'],
      businessProfile: { specializations: ['From businessProfile'] },
    })).toBe('From industrySpecialisms');

    // Tier 4: businessProfile.specializations used when first three absent.
    expect(resolvePlaceholders('{specialism}', {
      businessProfile: { specializations: ['From businessProfile'] },
    })).toBe('From businessProfile');

    // Default when every tier is empty / undefined.
    expect(resolvePlaceholders('{specialism}', {})).toBe('your main service area');
  });

  it('ignores empty / whitespace-only values in the specialism chain', () => {
    // Empty string in Tier 1 must skip to Tier 2 — not silently win.
    expect(resolvePlaceholders('{specialism}', {
      specialisms: [''],
      practiceAreas: ['Valid'],
    })).toBe('Valid');

    // Whitespace-only value should also be skipped.
    expect(resolvePlaceholders('{specialism}', {
      specialisms: ['   '],
      practiceAreas: ['Valid'],
    })).toBe('Valid');
  });

  it('leaves {N} and {X} unresolved in topic.primaryDataHook', async () => {
    currentVendor = defaultSolicitor();
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    // Every solicitor hook contains at least one of {N} / {X} / {Y}.
    // Spot-check solicitor-costs-1's hook specifically.
    const costs = r.body.pillars.find((p) => p.id === 'costs-fees');
    const topic1 = costs.topics.find((t) => t.id === 'solicitor-costs-1');
    // The hook: 'Based on our last {N} ... transactions in {city}, the
    //           typical all-in cost is £{X}.'
    expect(topic1.primaryDataHook).toContain('{N}');
    expect(topic1.primaryDataHook).toContain('{X}');
    // But {city} is still resolved within the hook.
    expect(topic1.primaryDataHook).not.toContain('{city}');
  });

  it('leaves vendor-fill placeholders literal across the whole response', async () => {
    currentVendor = defaultSolicitor();
    const r = await fetchLibrary();
    expect(r.status).toBe(200);
    // Scan every title + hook and assert the resolved four
    // ({city}, {specialism}, {firmName}, {year}) never leak — while
    // confirming that at least one vendor-fill placeholder like {N}
    // is preserved somewhere in a hook.
    let sawLiteralPlaceholder = false;
    for (const pillar of r.body.pillars) {
      for (const topic of pillar.topics) {
        expect(topic.title).not.toMatch(/\{(city|specialism|firmName|year)\}/);
        expect(topic.primaryDataHook).not.toMatch(/\{(city|specialism|firmName|year)\}/);
        if (/\{[NXYZ]\}/.test(topic.primaryDataHook)) sawLiteralPlaceholder = true;
      }
    }
    expect(sawLiteralPlaceholder).toBe(true);
  });
});
