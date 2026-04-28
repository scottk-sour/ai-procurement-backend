import mongoose from 'mongoose';

const agentRunSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  agentName: {
    type: String,
    required: true,
    enum: ['reconnaissance', 'detective', 'writer', 'listings', 'reviews', 'builder', 'reporter'],
  },
  weekStarting: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'partial'],
    default: 'pending',
    index: true,
  },
  startedAt: { type: Date },
  completedAt: { type: Date },
  durationMs: { type: Number },
  summary: { type: String },
  artifacts: { type: mongoose.Schema.Types.Mixed },
  metricsBefore: { type: mongoose.Schema.Types.Mixed },
  metricsAfter: { type: mongoose.Schema.Types.Mixed },
  failureReason: { type: String },
  relatedApprovalIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalQueue' }],
  source: { type: String },
}, { timestamps: true });

agentRunSchema.index({ vendorId: 1, weekStarting: -1, agentName: 1 });
agentRunSchema.index({ weekStarting: -1, status: 1 });

/**
 * Normalise any date to Monday 00:00:00.000 UTC of that ISO week.
 * ISO weeks start on Monday. getUTCDay() returns 0 for Sunday,
 * 1 for Monday … 6 for Saturday. We shift Sunday (0) to 7 so the
 * formula (day - 1) always gives a positive offset back to Monday.
 */
agentRunSchema.statics.normaliseWeekStarting = function (date) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7; // Sunday 0 → 7
  d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export default mongoose.model('AgentRun', agentRunSchema);
