import mongoose from 'mongoose';

/**
 * ContentApprovalRecord — immutable historical evidence that a firm's nominated
 * qualified person approved a specific AI-generated content draft.
 *
 * IMMUTABLE BY DESIGN:
 *  - written once, at the moment of a successful firm approval (before publication);
 *  - there is no API update endpoint and no API delete endpoint;
 *  - a pre-save guard rejects any modification of an already-persisted record;
 *  - the (approvalItemId, contentFingerprint) pair is unique: a pure publication
 *    retry of unchanged content reuses the existing record, while a re-approval
 *    after the content was edited writes a NEW record (so a record never
 *    describes a version the approver did not see).
 *
 * IDENTITY HONESTY: the firm authenticates through a shared Vendor account, not a
 * per-user login. This record therefore separates the authenticated acting
 * account (`approvedByVendorAccountId`) from the nominated qualified person the
 * firm recorded (the snapshotted `approver*` fields), and states explicitly that
 * the nominated person's identity was attested at firm-account level and NOT
 * individually authenticated (`individuallyAuthenticated: false`,
 * `identityAssurance: 'firm_account_attested'`). It does not claim the individual
 * reviewer was authenticated.
 *
 * The approver name/role/registration/regulator are SNAPSHOTS taken at approval
 * time — never live references — so changing the firm's nominated approver later
 * does not alter historical records.
 */
const contentApprovalRecordSchema = new mongoose.Schema({
  // Canonical linkage. Before publication the ApprovalQueue item is the canonical
  // id; unique so a retried publication cannot create a second record.
  approvalItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalQueue',
    required: true,
    index: true,
  },
  // Fingerprint of the exact merged content (title + body + social, after firm
  // data substitution) that the approver approved. Distinguishes a pure retry
  // of unchanged content (same fingerprint -> reuse the record) from a
  // re-approval after the content changed (new fingerprint -> new record).
  contentFingerprint: { type: String, required: true, index: true },
  // The firm whose content this is (used to scope a firm's own history).
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  // The authenticated Vendor account that performed the approval action.
  approvedByVendorAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
  },

  // Snapshot of the firm's nominated approver, as recorded at approval time.
  approverName: { type: String, required: true },
  approverRole: { type: String, required: true },
  approverRegistrationNumber: { type: String, required: true },
  approverRegulator: {
    type: String,
    enum: ['SRA', 'ICAEW', 'FCA', 'Propertymark'],
    required: true,
  },

  approvedAt: { type: Date, required: true }, // serialised as ISO 8601 in JSON
  qualifiedPersonConfirmation: { type: Boolean, required: true },

  // Explicit honesty about what the identity evidence proves.
  individuallyAuthenticated: { type: Boolean, required: true, default: false },
  identityAssurance: {
    type: String,
    enum: ['firm_account_attested'],
    required: true,
    default: 'firm_account_attested',
  },
}, { timestamps: true, collection: 'content_approval_records' });

// One record per (approval item, content version). A pure publication retry of
// unchanged content reuses the existing record; a re-approval after the content
// was edited has a different fingerprint and so writes a new record.
contentApprovalRecordSchema.index({ approvalItemId: 1, contentFingerprint: 1 }, { unique: true });

// Immutability guard: allow the initial write only; reject any later modification.
contentApprovalRecordSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('ContentApprovalRecord is immutable and cannot be modified after creation'));
  }
  next();
});

export default mongoose.model('ContentApprovalRecord', contentApprovalRecordSchema);
