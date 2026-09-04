import mongoose from 'mongoose';

/**
 * ClaimUseLabel — one document per (experiment run, citation index) for a
 * TendorAI citation observed in a wave >= 2 run of the AI-visibility content
 * study. Produced (with null label fields) by exportClaimUseSheet.js and filled
 * in by a human via importClaimUseLabels.js.
 *
 * SEPARATION OF EVIDENCE FROM JUDGEMENT:
 *  - The identifying / observational fields (runId, citationIndex, citationUrl,
 *    citedDomain, isTargetArticle, targetClaim, promptId, intent) are derived
 *    read-only from the immutable experiment_runs document and the frozen claim
 *    registry at export time. They are never re-derived after export (see D3:
 *    citationIndex is the stable citation identity).
 *  - The judgement fields (claimUsed, claimUsageType, labelledBy, labelledAt,
 *    notes) start null and are set only by a human label import. No script
 *    infers claimUsed; there is no classifier.
 *
 * claimUsed is a human assessment of the relationship between the cited article
 * and the answer text, against the supplied targetClaim — NOT an assessment of
 * whether TendorAI was generally relevant. It is only labellable when
 * isTargetArticle is true.
 */
const claimUseLabelSchema = new mongoose.Schema({
  study: { type: String, required: true, index: true },
  wave: { type: Number, required: true },
  runId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExperimentRun', required: true },
  promptId: { type: String, required: true },
  intent: { type: String, required: true }, // from the frozen config at export time
  citationIndex: { type: Number, required: true }, // zero-based index into experiment_runs.citedUrls[] (D3)
  citationUrl: { type: String, required: true }, // must equal citedUrls[citationIndex] exactly as stored
  citedDomain: { type: String, required: true }, // hostname minus leading www. (as citationLandscape.js)
  isTargetArticle: { type: Boolean, required: true }, // true only when D1 (URL match) held
  targetClaim: { type: String, default: null }, // copied from the registry only when isTargetArticle

  // ── Human judgement (null until a label import fills them in) ──
  // 0 cited but claim not used | 1 claim explicitly used | 2 related proposition
  // used | 3 cited for a different proposition. Only labellable when
  // isTargetArticle is true.
  claimUsed: { type: Number, enum: [0, 1, 2, 3, null], default: null },
  claimUsageType: { type: String, default: null }, // free text
  labelledBy: { type: String, default: null },
  labelledAt: { type: Date, default: null },
  notes: { type: String, default: null },
}, { timestamps: true, collection: 'claim_use_labels' });

// One label per (run, citation). Re-running the export inserts only new pairs;
// existing documents are never updated by export (import is the only writer of
// the judgement fields).
claimUseLabelSchema.index({ runId: 1, citationIndex: 1 }, { unique: true });

export default mongoose.model('ClaimUseLabel', claimUseLabelSchema);
