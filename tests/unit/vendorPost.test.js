import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Use the real model — we're testing schema validation and hooks, not mocking them.
const { default: VendorPost } = await import('../../models/VendorPost.js');

const VENDOR_ID = new mongoose.Types.ObjectId();
const AGENT_RUN_ID = new mongoose.Types.ObjectId();
const APPROVAL_ID = new mongoose.Types.ObjectId();

function buildPost(overrides = {}) {
  return new VendorPost({
    vendor: VENDOR_ID,
    title: 'Conveyancing costs in Cardiff 2026',
    body: 'This is a test blog post body with enough content.',
    ...overrides,
  });
}

describe('VendorPost Schema', () => {

  // ── Status enum ────────────────────────────────────────────
  describe('status enum', () => {
    it('accepts draft (default)', () => {
      const post = buildPost();
      expect(post.status).toBe('draft');
    });

    it('accepts pending_review', () => {
      const post = buildPost({ status: 'pending_review' });
      expect(post.status).toBe('pending_review');
    });

    it('accepts published', () => {
      const post = buildPost({ status: 'published' });
      expect(post.status).toBe('published');
    });

    it('accepts hidden', () => {
      const post = buildPost({ status: 'hidden' });
      expect(post.status).toBe('hidden');
    });

    it('rejects invalid status values', async () => {
      const post = buildPost({ status: 'agent_draft' });
      const err = post.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    it('rejects published_pending', async () => {
      const post = buildPost({ status: 'published_pending' });
      const err = post.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });
  });

  // ── Slug generation — manual posts ─────────────────────────
  describe('slug generation — manual posts', () => {
    it('generates slug without date suffix when aiGenerated is false and no agentRunId', async () => {
      const post = buildPost({ aiGenerated: false });
      await post.validate();
      const vendorSuffix = VENDOR_ID.toString().slice(-6);
      expect(post.slug).toBe(`conveyancing-costs-in-cardiff-2026-${vendorSuffix}`);
      expect(post.slug).not.toMatch(/\d{8}$/);
    });

    it('preserves existing slug behaviour for manual posts', async () => {
      const post = buildPost();
      await post.validate();
      const vendorSuffix = VENDOR_ID.toString().slice(-6);
      expect(post.slug).toMatch(new RegExp(`^conveyancing-costs-in-cardiff-2026-${vendorSuffix}$`));
    });
  });

  // ── Slug generation — agent posts ──────────────────────────
  describe('slug generation — agent posts', () => {
    it('appends YYYYMMDD when aiGenerated is true', async () => {
      const post = buildPost({ aiGenerated: true });
      await post.validate();
      const vendorSuffix = VENDOR_ID.toString().slice(-6);
      expect(post.slug).toMatch(new RegExp(`^conveyancing-costs-in-cardiff-2026-${vendorSuffix}-\\d{8}$`));
    });

    it('appends YYYYMMDD when agentRunId is set (regardless of aiGenerated)', async () => {
      const post = buildPost({ agentRunId: AGENT_RUN_ID, aiGenerated: false });
      await post.validate();
      const vendorSuffix = VENDOR_ID.toString().slice(-6);
      expect(post.slug).toMatch(new RegExp(`^conveyancing-costs-in-cardiff-2026-${vendorSuffix}-\\d{8}$`));
    });

    it('uses createdAt date for the suffix when available', async () => {
      const post = buildPost({
        aiGenerated: true,
        createdAt: new Date('2026-04-29T10:00:00Z'),
      });
      await post.validate();
      expect(post.slug).toContain('-20260429');
    });

    it('uses current date when createdAt not yet set', async () => {
      const post = buildPost({ aiGenerated: true });
      await post.validate();
      const today = new Date();
      const yyyy = today.getUTCFullYear();
      const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(today.getUTCDate()).padStart(2, '0');
      expect(post.slug).toContain(`-${yyyy}${mm}${dd}`);
    });
  });

  // ── Slug collision behaviour ───────────────────────────────
  describe('slug collisions', () => {
    it('two manual posts with same title + vendor produce identical slugs (unique index blocks second)', async () => {
      const post1 = buildPost();
      const post2 = buildPost();
      await post1.validate();
      await post2.validate();
      expect(post1.slug).toBe(post2.slug);
    });

    it('two agent posts with same title on different days produce different slugs', async () => {
      const post1 = buildPost({
        aiGenerated: true,
        createdAt: new Date('2026-04-29T10:00:00Z'),
      });
      const post2 = buildPost({
        aiGenerated: true,
        createdAt: new Date('2026-05-06T10:00:00Z'),
      });
      await post1.validate();
      await post2.validate();
      expect(post1.slug).not.toBe(post2.slug);
      expect(post1.slug).toContain('-20260429');
      expect(post2.slug).toContain('-20260506');
    });

    it('two agent posts with same title on same day produce identical slugs (acceptable — weekly cadence prevents this)', async () => {
      const post1 = buildPost({
        aiGenerated: true,
        createdAt: new Date('2026-04-29T08:00:00Z'),
      });
      const post2 = buildPost({
        aiGenerated: true,
        createdAt: new Date('2026-04-29T14:00:00Z'),
      });
      await post1.validate();
      await post2.validate();
      expect(post1.slug).toBe(post2.slug);
    });
  });

  // ── Writer Agent fields ────────────────────────────────────
  describe('agentRunId and relatedApprovalId', () => {
    it('can be set and retrieved', async () => {
      const post = buildPost({
        agentRunId: AGENT_RUN_ID,
        relatedApprovalId: APPROVAL_ID,
      });
      await post.validate();
      expect(post.agentRunId.toString()).toBe(AGENT_RUN_ID.toString());
      expect(post.relatedApprovalId.toString()).toBe(APPROVAL_ID.toString());
    });

    it('defaults to undefined when not set', () => {
      const post = buildPost();
      expect(post.agentRunId).toBeUndefined();
      expect(post.relatedApprovalId).toBeUndefined();
    });

    it('existing post without these fields validates fine', async () => {
      const post = buildPost({ status: 'published', category: 'guide' });
      const err = post.validateSync();
      expect(err).toBeUndefined();
    });
  });

  // ── Sparse compound index ──────────────────────────────────
  describe('indexes', () => {
    it('defines sparse compound index { agentRunId: 1, status: 1 }', () => {
      const indexes = VendorPost.schema.indexes();
      const found = indexes.find(([fields, options]) =>
        fields.agentRunId === 1 && fields.status === 1 && options?.sparse === true
      );
      expect(found).toBeDefined();
    });

    it('preserves existing indexes', () => {
      const indexes = VendorPost.schema.indexes();
      expect(indexes.find(([f]) => f.status === 1 && f.createdAt === -1)).toBeDefined();
      expect(indexes.find(([f]) => f.vendor === 1 && f.status === 1)).toBeDefined();
      expect(indexes.find(([f]) => f.tags === 1)).toBeDefined();
    });
  });
});
