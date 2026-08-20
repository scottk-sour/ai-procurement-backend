import mongoose from 'mongoose';

/**
 * SearchableSnapshot — verbatim mirror of raw JSON responses from the
 * Searchable measurement API (https://app.searchable.com).
 *
 * One document is written per (endpoint, page) fetch. The `raw` field holds
 * the response body EXACTLY as returned — no reshaping, no field renaming,
 * no derived metrics. Downstream code reads/derives from `raw`; this
 * collection is an append-only archive of what the API said, when.
 *
 * Nothing here overlaps the existing measurement collections
 * (AIMentionScan, experiment_runs, etc.) — this is a separate raw archive.
 * No TTL: history is retained indefinitely.
 */
const searchableSnapshotSchema = new mongoose.Schema({
  // Groups every document written in a single nightly pull.
  run_id: { type: String, required: true, index: true },

  // The Searchable project the snapshot belongs to.
  searchable_project_id: { type: String, required: true },

  // The API path that was fetched, e.g. '/api/mcp/projects/{id}/visibility'.
  endpoint: { type: String, required: true },

  // The exact query parameters sent (includes limit/offset for paged pulls),
  // so each page of a paginated endpoint is self-describing.
  params: { type: mongoose.Schema.Types.Mixed },

  // When this fetch completed.
  fetchedAt: { type: Date, required: true },

  // The response body, stored verbatim. Parsed JSON on success; the raw
  // problem+json body on an error/skip; the raw text if the body was not JSON.
  raw: { type: mongoose.Schema.Types.Mixed },

  // HTTP status code of the response (null if the request never completed).
  httpStatus: { type: Number, default: null },

  // Value of the response's X-Request-Id header, for tracing back to Searchable.
  requestId: { type: String, default: null },

  // Outcome of this single fetch:
  //   'ok'      — 2xx, body parsed as JSON and stored in `raw`
  //   'partial' — 2xx, but the body could not be parsed as JSON (raw text stored)
  //   'skipped' — expected 409 (gsc_not_connected / ga4_not_connected); not a failure
  //   'failed'  — network error or non-2xx (non-skip) status
  collection_status: {
    type: String,
    enum: ['ok', 'partial', 'skipped', 'failed'],
    required: true,
  },

  // Populated on 'failed' / 'skipped': RFC 9457 problem+json `code` plus a message.
  error: {
    message: { type: String, default: null },
    code: { type: String, default: null },
  },
}, { timestamps: false });

// Query archived snapshots by project + endpoint over time.
searchableSnapshotSchema.index({ searchable_project_id: 1, endpoint: 1, fetchedAt: -1 });

export default mongoose.model('SearchableSnapshot', searchableSnapshotSchema, 'searchable_snapshots');
