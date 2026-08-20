import cron from 'node-cron';
import crypto from 'crypto';
import SearchableSnapshot from '../models/SearchableSnapshot.js';
import logger from '../services/logger.js';

/**
 * Searchable API nightly mirror.
 *
 * Fetches raw JSON from the Searchable measurement API and stores each
 * response verbatim in the `searchable_snapshots` collection (one document
 * per endpoint page). No metrics are derived here — this is an archive.
 *
 * Schedule: 02:00 UTC daily (before the 03:00 mention scan). Gated on
 * ENABLE_CRON, exactly like the other agent crons.
 *
 * Auth: Bearer SEARCHABLE_API_KEY, read from process.env only — never stored.
 *
 * Adding an endpoint is a one-line entry in ENDPOINTS below, not a rewrite.
 */

const BASE_URL = 'https://app.searchable.com';

// Verified project id (supplied fact, not a secret). Hardcoded rather than
// invent an env var name for it.
const PROJECT_ID = 'e5448af1-76b4-4cef-a2c7-56644321b0aa';

// Politeness delay between requests. Rate limit is 600 req/min (10/s); a full
// nightly pull is only a few dozen requests, so this is far below the ceiling.
const REQUEST_DELAY_MS = 150;

// Safety cap so a misbehaving `hasMore` can never loop forever.
const MAX_PAGES = 1000;

// 409 codes that mean "integration not connected" — expected, not failures.
const SKIP_CODES = new Set(['gsc_not_connected', 'ga4_not_connected']);

/**
 * Endpoint catalogue. Every path and parameter here is confirmed against the
 * Searchable OpenAPI spec. `days` uses the per-endpoint maximum (365, or 180
 * where that is the cap) so the first run captures the most history possible.
 *
 * Fields:
 *   path      — template; {projectId} is substituted at fetch time
 *   params    — fixed query params sent every request
 *   paginated — offset pagination (limit/offset + response.pagination)
 *   limit     — page size for paginated endpoints (within the spec's max)
 *
 * NOT in v1 (need paths / fan-out the spec owner will supply separately):
 *   - Sources URL-level endpoint (cursor-paginated)
 *   - "Answers" endpoint (raw per-prompt AI responses)
 *   - Per-id detail endpoints (competitors/{id}, query-fanout/{promptId})
 * Each is a one-line ENDPOINTS addition once its path is confirmed.
 */
const ENDPOINTS = [
  { path: '/api/mcp/projects', params: {} },
  { path: '/api/mcp/projects/{projectId}', params: {} },

  { path: '/api/mcp/projects/{projectId}/visibility', params: { days: 365 } },
  { path: '/api/mcp/projects/{projectId}/visibility/history', params: { days: 365 } },
  { path: '/api/mcp/projects/{projectId}/visibility/prompts', params: { days: 180 }, paginated: true, limit: 500 },
  { path: '/api/mcp/projects/{projectId}/visibility/topics', params: { days: 365 } },
  { path: '/api/mcp/projects/{projectId}/visibility/platforms', params: { days: 365 } },
  { path: '/api/mcp/projects/{projectId}/visibility/locations', params: { days: 365 } },

  { path: '/api/mcp/projects/{projectId}/share-of-voice', params: { days: 365 } },
  { path: '/api/mcp/projects/{projectId}/share-of-voice/history', params: { days: 365 } },

  { path: '/api/mcp/projects/{projectId}/competitors', params: { days: 365 }, paginated: true, limit: 100 },

  { path: '/api/mcp/projects/{projectId}/prompts', params: { status: 'all' }, paginated: true, limit: 1000 },

  { path: '/api/mcp/projects/{projectId}/sentiment', params: { days: 365 } },
  { path: '/api/mcp/projects/{projectId}/sentiment/history', params: { days: 365 } },
  { path: '/api/mcp/projects/{projectId}/sentiment/competitors', params: { days: 365, limit: 50 } },

  { path: '/api/mcp/projects/{projectId}/query-fanout', params: { days: 180 }, paginated: true, limit: 50 },

  { path: '/api/mcp/projects/{projectId}/sources/domains', params: { days: 365 }, paginated: true, limit: 1000 },

  { path: '/api/mcp/projects/{projectId}/pages', params: {} },
  { path: '/api/mcp/projects/{projectId}/audits', params: { includeIssues: true } },
  { path: '/api/mcp/projects/{projectId}/issues', params: {}, paginated: true, limit: 100 },
  { path: '/api/mcp/projects/{projectId}/opportunities', params: { includeResolved: true }, paginated: true, limit: 100 },

  { path: '/api/mcp/projects/{projectId}/brand-profile', params: {} },
  { path: '/api/mcp/projects/{projectId}/domain-authority', params: { days: 365 } },
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function buildUrl(pathTemplate, params) {
  const path = pathTemplate.replace('{projectId}', PROJECT_ID);
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url;
}

/**
 * Perform a single GET and classify the outcome. Never throws — always
 * resolves to a descriptor the caller persists.
 */
async function fetchOnce(apiKey, pathTemplate, params) {
  const url = buildUrl(pathTemplate, params);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });

    const requestId = resp.headers.get('x-request-id') || null;
    const httpStatus = resp.status;
    const bodyText = await resp.text();

    let parsed;
    let parseOk = true;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parseOk = false;
      parsed = bodyText; // keep the raw text verbatim
    }

    if (resp.ok) {
      return {
        httpStatus,
        requestId,
        raw: parsed,
        collection_status: parseOk ? 'ok' : 'partial',
        error: { message: null, code: null },
        // pagination block is only meaningful on a parsed success
        pagination: parseOk && parsed && typeof parsed === 'object' ? parsed.pagination : null,
      };
    }

    // Non-2xx. Pull problem+json `code`/message if present.
    const code = parseOk && parsed && typeof parsed === 'object' ? (parsed.code ?? null) : null;
    const message = parseOk && parsed && typeof parsed === 'object'
      ? (parsed.detail ?? parsed.title ?? null)
      : (typeof parsed === 'string' ? parsed.slice(0, 500) : null);

    const skipped = httpStatus === 409 && code && SKIP_CODES.has(code);
    return {
      httpStatus,
      requestId,
      raw: parsed,
      collection_status: skipped ? 'skipped' : 'failed',
      error: { message, code },
      pagination: null,
    };
  } catch (err) {
    // Network / transport failure — request never completed.
    return {
      httpStatus: null,
      requestId: null,
      raw: null,
      collection_status: 'failed',
      error: { message: err.message, code: null },
      pagination: null,
    };
  }
}

async function persist(runId, endpoint, params, result) {
  await SearchableSnapshot.create({
    run_id: runId,
    searchable_project_id: PROJECT_ID,
    endpoint,
    params,
    fetchedAt: new Date(),
    raw: result.raw,
    httpStatus: result.httpStatus,
    requestId: result.requestId,
    collection_status: result.collection_status,
    error: result.error,
  });
}

/**
 * Pull every configured endpoint once and archive the raw responses.
 * Assumes an active mongoose connection (same as the other agent crons).
 * Never throws for a per-endpoint failure — the run continues and each
 * failure is recorded as its own snapshot document.
 *
 * @returns {Promise<{runId:string, ok:number, partial:number, skipped:number, failed:number, docs:number}>}
 */
export async function pullSearchableSnapshots() {
  const apiKey = process.env.SEARCHABLE_API_KEY;
  if (!apiKey) {
    logger.error('[SearchableMirror] SEARCHABLE_API_KEY not set — aborting run.');
    throw new Error('SEARCHABLE_API_KEY not set');
  }

  const runId = crypto.randomUUID();
  const tally = { ok: 0, partial: 0, skipped: 0, failed: 0, docs: 0 };
  logger.info(`[SearchableMirror] Run ${runId} starting: ${ENDPOINTS.length} endpoints.`);

  for (const ep of ENDPOINTS) {
    if (ep.paginated) {
      let offset = 0;
      let page = 0;
      while (page < MAX_PAGES) {
        const params = { ...ep.params, limit: ep.limit, offset };
        const result = await fetchOnce(apiKey, ep.path, params);
        await persist(runId, ep.path, params, result);
        tally[result.collection_status] += 1;
        tally.docs += 1;
        page += 1;

        const pg = result.pagination;
        const hasMore = !!(pg && pg.hasMore);
        if (!hasMore || result.collection_status !== 'ok') break;

        // Advance by the server's nextOffset when given, else by our limit.
        offset = Number.isFinite(pg.nextOffset) ? pg.nextOffset : offset + ep.limit;
        await sleep(REQUEST_DELAY_MS);
      }
      if (page >= MAX_PAGES) {
        logger.warn(`[SearchableMirror] ${ep.path} hit MAX_PAGES (${MAX_PAGES}) — stopped paginating.`);
      }
    } else {
      const result = await fetchOnce(apiKey, ep.path, ep.params);
      await persist(runId, ep.path, ep.params, result);
      tally[result.collection_status] += 1;
      tally.docs += 1;
    }
    await sleep(REQUEST_DELAY_MS);
  }

  logger.info(
    `[SearchableMirror] Run ${runId} complete: ${tally.docs} docs ` +
    `(ok=${tally.ok}, partial=${tally.partial}, skipped=${tally.skipped}, failed=${tally.failed}).`
  );
  return { runId, ...tally };
}

/**
 * Register the nightly cron. Self-gates on ENABLE_CRON, matching the other
 * agent registrars. Safe to call unconditionally at startup.
 */
export function registerSearchableMirrorCron() {
  if (process.env.ENABLE_CRON !== 'true') return;

  // 02:00 UTC daily — clear of every existing schedule (all 03:00 UTC or later).
  cron.schedule('0 2 * * *', async () => {
    logger.info('[SearchableMirror] Cron trigger: 02:00 UTC');
    try {
      await pullSearchableSnapshots();
    } catch (err) {
      logger.error('[SearchableMirror] Nightly run failed:', err.message);
    }
  });

  logger.info('[SearchableMirror] Cron registered: every day at 02:00 UTC');
}
