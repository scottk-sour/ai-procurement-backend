import { SONNET_MODEL } from '../../lib/config/models.js';
import { extractFirstJsonObject } from './jsonExtract.js';

const ALLOWED_DOMAINS = [
  'legislation.gov.uk', 'gov.uk', 'gov.wales', 'law.gov.wales',
  'commonslibrary.parliament.uk', 'sra.org.uk', 'lawsociety.org.uk',
  'legalombudsman.org.uk', 'icaew.com', 'accaglobal.com',
  'fca.org.uk', 'register.fca.org.uk', 'handbook.fca.org.uk',
  'financial-ombudsman.org.uk', 'propertymark.co.uk', 'tpos.co.uk',
  'theprs.co.uk', 'rentsmart.gov.wales',
  'rics.org', 'aat.org.uk', 'tax.org.uk', 'fscs.org.uk', 'ico.org.uk',
];

const EXTRACT_SYSTEM = `You are a legal-claim extractor for UK regulated professional services content. Read the draft and extract claims in FOUR categories:
1. LAW/REGULATOR requirements — what the law requires, what regulators mandate, what Acts say, deadlines, obligations.
2. APPLICABILITY claims — "in England and Wales…", "the only scheme is…", "you must…", geographic/jurisdictional scope assertions.
3. FIRM-STATUS claims — memberships, qualifications, "our NAEA-qualified staff", "we are FCA-authorised", who regulates the firm, client entitlements through the firm.
4. FIGURES/SCHEMES/QUALIFICATIONS stated as fact — named schemes, named qualifications, specific processes described as mandatory.

Exclude ONLY pure marketing with no legal/regulatory dimension (e.g. "we pride ourselves on service").

Return JSON only: { "claims": [{ "id": "c1", "type": "law"|"applicability"|"firm-status"|"factual", "text": "the exact claim sentence" }] }. Max 12 claims. If there are no claims, return { "claims": [] }.`;

const BATCH_SIZE = 6;
const MAX_CONTINUATIONS = 5;
const VERIFY_MAX_TOKENS = 6000;

function buildVerifySystem(jurisdiction, regulator, firmFacts) {
  return `You are a UK legal fact-checker verifying claims for a firm in ${jurisdiction}${regulator ? `, regulated by ${regulator}` : ''}.

For each claim, search the allowed official domains and judge it AS IT APPLIES TO THIS SPECIFIC FIRM. A claim FAILS if it:
- Is factually wrong about the law
- Applies the wrong nation's law to this firm (e.g. English law for a Welsh firm, or vice versa)
- Is misleading by omission (e.g. names one approved scheme as "the" scheme when several satisfy the law)
- Is outdated (cites a repealed Act, a superseded threshold, a defunct scheme)
- Is hallucinated (describes a requirement, scheme, or qualification that does not exist)
- Is a firm-status claim (membership, qualification, accreditation, "we are X-registered") that is NOT confirmed in the firm facts below — these FAIL as "firm-unverified" (fix = remove the claim, not reword it)

A claim PASSES only if it is factually correct, applies to this firm's jurisdiction, and any firm-specific assertions are confirmed in the firm facts.
Only genuinely cosmetic wording differences pass as acceptable.

FIRM FACTS (the ONLY verified source for firm-specific claims):
${firmFacts || '(none provided)'}

RESPONSE FORMAT — return ONLY the JSON object below, no commentary before or after:
{ "results": [{ "id": "c1", "verdict": "verified"|"contradicted"|"firm-unverified"|"unverifiable", "reason": "<max 25 words>", "source": null|"official URL", "repair": null|"suggested replacement text for non-verified claims only", "confidence": "high"|"medium"|"low" }] }`;
}

function extractJson(text) {
  const obj = extractFirstJsonObject(text);
  if (!obj) throw new Error('No complete JSON object in response');
  return JSON.parse(obj);
}

class VerifyTruncationError extends Error {
  constructor(stopReason, rawTail) {
    super(`Verification response truncated (stop_reason: ${stopReason}). Last 400 chars: ${rawTail}`);
    this.name = 'VerifyTruncationError';
    this.stopReason = stopReason;
  }
}

class VerifyPauseTurnError extends Error {
  constructor(continuations) {
    super(`Verification exhausted ${continuations} pause_turn continuations without completing`);
    this.name = 'VerifyPauseTurnError';
  }
}

async function callWithRetry(fn, label, maxAttempts = 2, backoffMs = 1500) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        console.warn(`[verifyClaims] ${label} attempt ${attempt + 1} failed (${err.message}), retrying after ${backoffMs / 1000}s`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastError;
}

async function callVerifyWithContinuation(anthropic, systemPrompt, userContent) {
  const messages = [{ role: 'user', content: userContent }];

  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const resp = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: VERIFY_MAX_TOKENS,
      temperature: 0,
      system: systemPrompt,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 8,
        allowed_domains: ALLOWED_DOMAINS,
      }],
      messages,
    });

    const stopReason = resp.stop_reason;

    if (stopReason === 'end_turn') {
      const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (!raw) {
        console.warn('[verifyClaims] end_turn with zero text blocks — content types:', resp.content.map(b => b.type).join(', '));
        throw new VerifyPauseTurnError(turn);
      }
      return { raw, stopReason };
    }

    if (stopReason === 'max_tokens') {
      const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const tail = (raw || '').slice(-400);
      console.warn(`[verifyClaims] TRUNCATED at max_tokens. Last 400 chars: ${tail}`);
      throw new VerifyTruncationError(stopReason, tail);
    }

    if (stopReason === 'pause_turn') {
      if (turn >= MAX_CONTINUATIONS) {
        console.warn(`[verifyClaims] pause_turn continuation cap (${MAX_CONTINUATIONS}) reached`);
        throw new VerifyPauseTurnError(MAX_CONTINUATIONS);
      }
      messages.push({ role: 'assistant', content: resp.content });
      messages.push({ role: 'user', content: 'Continue.' });
      continue;
    }

    const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    if (raw) return { raw, stopReason };
    throw new Error(`Unexpected stop_reason "${stopReason}" with no text output`);
  }

  throw new VerifyPauseTurnError(MAX_CONTINUATIONS);
}

async function verifyBatch(anthropic, batchClaims, jurisdiction, regulator, firmFacts, vertical, batchLabel) {
  return callWithRetry(async () => {
    const systemPrompt = buildVerifySystem(jurisdiction, regulator, firmFacts);
    const userContent = `Verify these claims for a ${vertical} firm in ${jurisdiction}${regulator ? ` (regulated by ${regulator})` : ''}.\n\nClaims:\n${batchClaims.map(c => `${c.id} [${c.type}]: ${c.text}`).join('\n')}`;
    const { raw, stopReason } = await callVerifyWithContinuation(anthropic, systemPrompt, userContent);

    try {
      return extractJson(raw);
    } catch (parseErr) {
      const tail = (raw || '').slice(-400);
      console.warn(`[verifyClaims] ${batchLabel} JSON parse failed (stop_reason: ${stopReason}). Last 400 chars: ${tail}`);
      throw parseErr;
    }
  }, batchLabel);
}

export async function verifyClaims({ draftText, vertical, jurisdiction = 'the UK', regulator = null, firmFacts = null }) {
  const startMs = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: 'not_run', issues: [], meta: { guard: 'legal-review', error: 'ANTHROPIC_API_KEY not set', executionMs: Date.now() - startMs } };
  }

  let anthropic;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (err) {
    return { status: 'error', issues: [], meta: { guard: 'legal-review', error: `SDK init failed: ${err.message}`, executionMs: Date.now() - startMs } };
  }

  let claims;
  try {
    const parsed = await callWithRetry(async () => {
      const extractResp = await anthropic.messages.create({
        model: SONNET_MODEL,
        max_tokens: 1500,
        temperature: 0,
        system: EXTRACT_SYSTEM,
        messages: [{ role: 'user', content: `Vertical: ${vertical}\nJurisdiction: ${jurisdiction}\n\nDraft:\n${draftText}` }],
      });
      const raw = extractResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
      return extractJson(raw);
    }, 'extraction');
    claims = parsed.claims || [];
  } catch (err) {
    return { status: 'error', issues: [], meta: { guard: 'legal-review', error: `Claim extraction failed after 2 attempts: ${err.message}`, executionMs: Date.now() - startMs } };
  }

  if (claims.length === 0) {
    return { status: 'pass', issues: [], meta: { guard: 'legal-review', model: SONNET_MODEL, jurisdiction, regulator, executionMs: Date.now() - startMs, claimCount: 0 } };
  }

  const batches = [];
  for (let i = 0; i < claims.length; i += BATCH_SIZE) {
    batches.push(claims.slice(i, i + BATCH_SIZE));
  }

  const allResults = [];
  const batchErrors = [];

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const label = `verification batch ${bi + 1}/${batches.length}`;
    try {
      const parsed = await verifyBatch(anthropic, batch, jurisdiction, regulator, firmFacts, vertical, label);
      allResults.push(...(parsed.results || []));
    } catch (err) {
      console.error(`[verifyClaims] ${label} failed after retries: ${err.message}`);
      batchErrors.push({ batch: bi + 1, error: err.message, claimIds: batch.map(c => c.id) });
    }
  }

  if (allResults.length === 0 && batchErrors.length > 0) {
    const errSummary = batchErrors.map(e => `batch ${e.batch}: ${e.error}`).join('; ');
    return { status: 'error', issues: [], meta: { guard: 'legal-review', error: `All verification batches failed: ${errSummary}`, model: SONNET_MODEL, jurisdiction, regulator, executionMs: Date.now() - startMs, claimCount: claims.length } };
  }

  const resultMap = new Map(allResults.map(r => [r.id, r]));
  const issues = [];

  for (const c of claims) {
    const r = resultMap.get(c.id);
    if (!r) {
      const inFailedBatch = batchErrors.some(e => e.claimIds.includes(c.id));
      if (inFailedBatch) {
        issues.push({
          id: c.id, type: c.type || 'unknown', severity: 'medium', verdict: 'unverifiable',
          sentence: c.text, reason: 'Verification batch failed — claim not checked',
          officialSource: null, repair: null, confidence: 'low',
        });
      }
      continue;
    }
    const verdict = r.verdict || 'unverifiable';
    if (verdict === 'verified') continue;

    const severity = verdict === 'contradicted' ? 'critical'
      : verdict === 'firm-unverified' ? 'high'
      : 'medium';

    issues.push({
      id: c.id,
      type: c.type || 'unknown',
      severity,
      verdict,
      sentence: c.text,
      reason: r.reason || 'No result returned from verification',
      officialSource: r.source || null,
      repair: r.repair || null,
      confidence: r.confidence || 'medium',
    });
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    meta: {
      guard: 'legal-review', model: SONNET_MODEL, jurisdiction, regulator,
      executionMs: Date.now() - startMs, claimCount: claims.length,
      batchCount: batches.length,
      ...(batchErrors.length > 0 ? { batchErrors } : {}),
    },
  };
}
