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

Return JSON only: { "results": [{ "id": "c1", "verdict": "verified"|"contradicted"|"firm-unverified"|"unverifiable", "reason": "why it failed or passed", "correction": null|"the correct position", "source": null|"official URL", "repair": null|"suggested replacement text", "confidence": "high"|"medium"|"low" }] }`;
}

function extractJson(text) {
  const obj = extractFirstJsonObject(text);
  if (!obj) throw new Error('No complete JSON object in response');
  return JSON.parse(obj);
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
    const extractResp = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: `Vertical: ${vertical}\nJurisdiction: ${jurisdiction}\n\nDraft:\n${draftText}` }],
    });
    const raw = extractResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = extractJson(raw);
    claims = parsed.claims || [];
  } catch (err) {
    return { status: 'error', issues: [], meta: { guard: 'legal-review', error: `Claim extraction failed: ${err.message}`, executionMs: Date.now() - startMs } };
  }

  if (claims.length === 0) {
    return { status: 'pass', issues: [], meta: { guard: 'legal-review', model: SONNET_MODEL, jurisdiction, regulator, executionMs: Date.now() - startMs, claimCount: 0 } };
  }

  let results;
  try {
    const verifyResp = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 3000,
      temperature: 0,
      system: buildVerifySystem(jurisdiction, regulator, firmFacts),
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 10,
        allowed_domains: ALLOWED_DOMAINS,
      }],
      messages: [{
        role: 'user',
        content: `Verify these claims for a ${vertical} firm in ${jurisdiction}${regulator ? ` (regulated by ${regulator})` : ''}.\n\nClaims:\n${claims.map(c => `${c.id} [${c.type}]: ${c.text}`).join('\n')}`,
      }],
    });
    const raw = verifyResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = extractJson(raw);
    results = parsed.results || [];
  } catch (err) {
    return { status: 'error', issues: [], meta: { guard: 'legal-review', error: `Claim verification failed: ${err.message}`, model: SONNET_MODEL, jurisdiction, regulator, executionMs: Date.now() - startMs, claimCount: claims.length } };
  }

  const resultMap = new Map(results.map(r => [r.id, r]));
  const issues = [];

  for (const c of claims) {
    const r = resultMap.get(c.id);
    const verdict = r?.verdict || 'unverifiable';
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
      reason: r?.reason || 'No result returned from verification',
      officialSource: r?.source || null,
      repair: r?.repair || null,
      confidence: r?.confidence || 'medium',
    });
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    meta: { guard: 'legal-review', model: SONNET_MODEL, jurisdiction, regulator, executionMs: Date.now() - startMs, claimCount: claims.length },
  };
}
