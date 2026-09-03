import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
  aiCreateWouldPublish,
  aiTransitionWouldPublish,
  requiresFirmContentApproval,
} from '../../utils/aiContentPublishGuard.js';
import ContentApprovalRecord from '../../models/ContentApprovalRecord.js';

// ── Bypass guard predicates (the decision every publish route now shares) ──
describe('aiContentPublishGuard predicates', () => {
  describe('aiCreateWouldPublish (vendor POST /posts — publishes unless status is "draft")', () => {
    it('blocks AI content when status is published', () => {
      expect(aiCreateWouldPublish({ aiGenerated: true, status: 'published' })).toBe(true);
    });
    it('blocks AI content when status is omitted (route defaults to published)', () => {
      expect(aiCreateWouldPublish({ aiGenerated: true, status: undefined })).toBe(true);
    });
    it('allows AI content saved explicitly as draft', () => {
      expect(aiCreateWouldPublish({ aiGenerated: true, status: 'draft' })).toBe(false);
    });
    it('does not block non-AI content (#18)', () => {
      expect(aiCreateWouldPublish({ aiGenerated: false, status: 'published' })).toBe(false);
    });
  });

  describe('aiTransitionWouldPublish (PUT / PATCH — only explicit publish)', () => {
    it('blocks AI content transitioning to published', () => {
      expect(aiTransitionWouldPublish({ aiGenerated: true, status: 'published' })).toBe(true);
    });
    it('allows AI content moving to draft or hidden', () => {
      expect(aiTransitionWouldPublish({ aiGenerated: true, status: 'draft' })).toBe(false);
      expect(aiTransitionWouldPublish({ aiGenerated: true, status: 'hidden' })).toBe(false);
    });
    it('does not block non-AI content (#18)', () => {
      expect(aiTransitionWouldPublish({ aiGenerated: false, status: 'published' })).toBe(false);
    });
  });

  describe('requiresFirmContentApproval (admin execute block)', () => {
    it('is true for content_draft (#14)', () => {
      expect(requiresFirmContentApproval({ itemType: 'content_draft' })).toBe(true);
    });
    it('is false for other item types (unrelated execute behaviour preserved)', () => {
      expect(requiresFirmContentApproval({ itemType: 'directory_submission' })).toBe(false);
      expect(requiresFirmContentApproval(null)).toBe(false);
    });
  });
});

// ── The immutable approval record model ──
describe('ContentApprovalRecord model', () => {
  const valid = () => ({
    approvalItemId: new mongoose.Types.ObjectId(),
    vendorId: new mongoose.Types.ObjectId(),
    approvedByVendorAccountId: new mongoose.Types.ObjectId(),
    approverName: 'Jane Smith',
    approverRole: 'Partner',
    approverRegistrationNumber: '123456',
    approverRegulator: 'SRA',
    approvedAt: new Date(),
    qualifiedPersonConfirmation: true,
    contentFingerprint: 'fp-abc123',
  });

  it('requires the core evidence fields', () => {
    const err = new ContentApprovalRecord({}).validateSync();
    expect(err).toBeDefined();
    for (const f of [
      'approvalItemId', 'vendorId', 'approvedByVendorAccountId',
      'approverName', 'approverRole', 'approverRegistrationNumber',
      'approverRegulator', 'approvedAt', 'qualifiedPersonConfirmation',
      'contentFingerprint',
    ]) {
      expect(err.errors[f]).toBeDefined();
    }
  });

  it('accepts only the four permitted regulators', () => {
    expect(new ContentApprovalRecord({ ...valid(), approverRegulator: 'GDC' }).validateSync().errors.approverRegulator).toBeDefined();
    for (const reg of ['SRA', 'ICAEW', 'FCA', 'Propertymark']) {
      expect(new ContentApprovalRecord({ ...valid(), approverRegulator: reg }).validateSync()).toBeUndefined();
    }
  });

  it('defaults the honesty fields to firm-account-level attestation (#10)', () => {
    const rec = new ContentApprovalRecord(valid());
    expect(rec.individuallyAuthenticated).toBe(false);
    expect(rec.identityAssurance).toBe('firm_account_attested');
  });

  it('is immutable — a modification after creation is rejected', async () => {
    const rec = new ContentApprovalRecord(valid());
    // Simulate an already-persisted record without a live DB, then attempt to
    // modify + save. The pre-save guard rejects before any DB write.
    rec.isNew = false;
    rec.approverName = 'Someone Else';
    await expect(rec.save()).rejects.toThrow(/immutable/i);
  });
});
