import mongoose from 'mongoose';

const approvalQueueSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  agentName: {
    type: String,
    required: true,
    enum: ['reconnaissance', 'detective', 'writer', 'listings', 'reviews', 'builder', 'reporter', 'manual'],
  },
  itemType: {
    type: String,
    required: true,
    enum: ['schema_change', 'content_draft', 'directory_submission', 'review_request_batch', 'press_release', 'outreach_pitch', 'other'],
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  draftPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'approved', 'rejected', 'executed', 'failed'],
    default: 'pending',
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  decidedAt: { type: Date },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decisionReason: { type: String },
  executedAt: { type: Date },
  executionResult: { type: mongoose.Schema.Types.Mixed },
  executionError: { type: String },
  liveUrl: { type: String, default: null },
  source: { type: String },
});

approvalQueueSchema.index({ vendorId: 1, status: 1, createdAt: -1 });

export default mongoose.model('ApprovalQueue', approvalQueueSchema);
