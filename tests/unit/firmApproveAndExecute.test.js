import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_ID = new mongoose.Types.ObjectId();
const APPROVAL_ID = new mongoose.Types.ObjectId();

// Shared, per-test-controllable state (hoisted so the vi.mock factories can see it).
const state = vi.hoisted(() => ({
  item: null,
  approver: null,          // Vendor.nominatedApprover
  publishShouldFail: false,
  publishError: 'Validation failed',   // firm-retriable pattern
  records: [],             // stand-in ContentApprovalRecord collection
}));

vi.mock('../../models/ApprovalQueue.js', () => ({
  default: { findById: () => state.item },
}));

vi.mock('../../models/Vendor.js', () => ({
  default: {
    findById: () => ({ select: () => ({ lean: async () => ({ nominatedApprover: state.approver }) }) }),
  },
}));

vi.mock('../../models/ContentApprovalRecord.js', () => ({
  default: {
    create: async (data) => { const rec = { _id: `rec-${state.records.length}`, ...data }; state.records.push(rec); return rec; },
    findOne: (q) => ({ lean: async () => state.records.find((r) => String(r.approvalItemId) === String(q.approvalItemId) && r.contentFingerprint === q.contentFingerprint) || null }),
  },
}));

vi.mock('../../models/VendorPost.js', () => {
  function MockVendorPost(data) {
    Object.assign(this, data);
    this._id = 'post-id';
    this.slug = 'mock-slug';
    this.createdAt = new Date();
    this.save = async () => { if (state.publishShouldFail) throw new Error(state.publishError); return this; };
  }
  return { default: MockVendorPost };
});

const { firmApproveAndExecute } = await import('../../services/approvalQueue.js');

const OK_CONFIRM = { qualifiedPersonConfirmation: true };
const call = (opts = OK_CONFIRM) => firmApproveAndExecute(APPROVAL_ID, VENDOR_ID.toString(), opts);

beforeEach(() => {
  state.records = [];
  state.publishShouldFail = false;
  state.publishError = 'Validation failed';
  state.approver = { name: 'Jane Smith', role: 'Partner', registrationNumber: '123456', regulator: 'SRA' };
  state.item = {
    _id: APPROVAL_ID,
    vendorId: VENDOR_ID,
    itemType: 'content_draft',
    status: 'approved',
    draftPayload: { title: 'A title', body: 'A body with no placeholders.' },
    firmData: {},
    metadata: {},
    firmApprovedAt: null,
    firmApprovedBy: null,
    save: async function () { return this; },
  };
});

describe('firmApproveAndExecute — approval gate', () => {
  it('#1 fails when the firm has no nominated approver, and writes no record', async () => {
    state.approver = null;
    await expect(call()).rejects.toThrow(/nominated qualified approver/i);
    expect(state.records).toHaveLength(0);
  });

  it('#2 fails when confirmation is absent', async () => {
    await expect(call({})).rejects.toThrow(/qualified person/i);
    expect(state.records).toHaveLength(0);
  });

  it('#3 fails when confirmation is false', async () => {
    await expect(call({ qualifiedPersonConfirmation: false })).rejects.toThrow(/qualified person/i);
    expect(state.records).toHaveLength(0);
  });

  it('#4 succeeds and #5 creates exactly one approval record', async () => {
    const result = await call();
    expect(result.ok).toBe(true);
    expect(state.records).toHaveLength(1);
  });
});

describe('firmApproveAndExecute — the approval record', () => {
  it('#6 records the acting Vendor account id; #7 snapshots name/role/registration/regulator', async () => {
    await call();
    const rec = state.records[0];
    expect(rec.approvedByVendorAccountId).toBe(VENDOR_ID.toString());
    expect(rec.approverName).toBe('Jane Smith');
    expect(rec.approverRole).toBe('Partner');
    expect(rec.approverRegistrationNumber).toBe('123456');
    expect(rec.approverRegulator).toBe('SRA');
  });

  it('#8 has a Date/ISO-serialisable approval timestamp; #9 records the confirmation', async () => {
    await call();
    const rec = state.records[0];
    expect(rec.approvedAt).toBeInstanceOf(Date);
    expect(() => rec.approvedAt.toISOString()).not.toThrow();
    expect(rec.qualifiedPersonConfirmation).toBe(true);
  });

  it('#10 explicitly records firm-account-level attestation, not individual authentication', async () => {
    await call();
    const rec = state.records[0];
    expect(rec.individuallyAuthenticated).toBe(false);
    expect(rec.identityAssurance).toBe('firm_account_attested');
  });

  it('#11 changing the nominated approver afterwards does not alter the historical record', async () => {
    await call();
    const rec = state.records[0];
    // Firm later changes its nominated approver.
    state.approver = { name: 'New Person', role: 'Consultant', registrationNumber: '999999', regulator: 'ICAEW' };
    expect(rec.approverName).toBe('Jane Smith');
    expect(rec.approverRegistrationNumber).toBe('123456');
    expect(rec.approverRegulator).toBe('SRA');
  });
});

describe('firmApproveAndExecute — failure & retry', () => {
  it('#12 a publication failure does not erase the approval evidence', async () => {
    state.publishShouldFail = true; // firm-retriable ("Validation failed")
    const result = await call();
    expect(result.ok).toBe(false);
    expect(result.firmRetriable).toBe(true);
    // Evidence preserved:
    expect(state.records).toHaveLength(1);
    expect(state.item.firmApprovedBy).toBe(VENDOR_ID.toString());
    expect(state.item.firmApprovedAt).toBeTruthy();
  });

  it('#13 retrying publication does not create a duplicate approval record', async () => {
    state.publishShouldFail = true;
    const first = await call();
    expect(first.firmRetriable).toBe(true);
    expect(state.records).toHaveLength(1);
    // The item is back to 'approved' so the firm can retry; publication now works.
    state.publishShouldFail = false;
    const second = await call();
    expect(second.ok).toBe(true);
    expect(state.records).toHaveLength(1); // still one — no duplicate
  });

  it('#13b re-approval after the content was edited writes a NEW record', async () => {
    await call();
    expect(state.records).toHaveLength(1);
    const firstFingerprint = state.records[0].contentFingerprint;
    expect(firstFingerprint).toBeTruthy();

    // The draft is edited and re-approved (admin returns it to 'approved').
    state.item.status = 'approved';
    state.item.draftPayload = { title: 'A title', body: 'A DIFFERENT body after an edit.' };

    const result = await call();
    expect(result.ok).toBe(true);
    expect(state.records).toHaveLength(2);            // new version -> new record
    expect(state.records[1].contentFingerprint).not.toBe(firstFingerprint);
  });
});
