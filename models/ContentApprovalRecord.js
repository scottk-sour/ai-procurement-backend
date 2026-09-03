import mongoose from 'mongoose';

/**
 * ContentApprovalRecord — immutable historical evidence that a firm's nominated
 * qualified person approved a specific AI-generated content draft.
 *
 * IMMUTABLE BY DESIGN:
 *  - written once, at the moment of a successful firm approval (before publication);
 *  - there is no API update endpoint and no API delete endpoint;
 *  - a pre-save guard rejects any modification of an already-persisted record;
 *  - `approvalItemId` is unique, so publication retries never create duplicates.
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
    unique: true,
    index: true,
  },
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

// Immutability guard: allow the initial write only; reject any later modification.
contentApprovalRecordSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('ContentApprovalRecord is immutable and cannot be modified after creation'));
  }
  next();
});

export default mongoose.model('ContentApprovalRecord', contentApprovalRecordSchema);
