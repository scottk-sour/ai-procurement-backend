import { SONNET_MODEL } from '../../lib/config/models.js';

const ALLOWED_DOMAINS = [
  'legislation.gov.uk', 'gov.uk', 'gov.wales', 'law.gov.wales',
  'commonslibrary.parliament.uk', 'sra.org.uk', 'lawsociety.org.uk',
  'legalombudsman.org.uk', 'icaew.com', 'accaglobal.com',
  'fca.org.uk', 'register.fca.org.uk', 'handbook.fca.org.uk',
  'financial-ombudsman.org.uk', 'propertymark.co.uk', 'tpos.co.uk',
  'theprs.co.uk', 'rentsmart.gov.wales',
];

const EXTRACT_SYSTEM = `You are a legal-claim extractor. Read the draft and extract ONLY legal, regulatory, and statutory claims — statements about what the law requires, what regulators mandate, what Acts say, what schemes are compulsory, what deadlines apply. Do NOT extract firm-data claims (fees, years in business, team size). Return JSON only: { "claims": [{ "id": "c1", "text": "the exact claim sentence" }] }. Max 12 claims. If there are no legal/regulatory claims, return { "claims": [] }.`;

const VERIFY_SYSTEM = `You are a UK legal fact-checker. For each claim, search the allowed domains and determine:
- "verified": an official source confirms the claim is correct.
- "contradicted": an official source shows the claim is wrong. Provide the correction and source URL.
- "unverifiable": no official source found, or the claim is too vague to verify.

Return JSON only: { "results": [{ "id": "c1", "verdict": "verified"|"contradicted"|"unverifiable", "correction": null|string, "source": null|string }] }`;

export async function verifyClaims({ draftText, vertical }) {
  let anthropic;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (err) {
    return { verdict: 'fail', error: `SDK init failed: ${err.message}`, claims: [], results: [] };
  }

  let claims;
  try {
    const extractResp = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: `Vertical: ${vertical}\n\nDraft:\n${draftText}` }],
    });
    const raw = extractResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    claims = parsed.claims || [];
  } catch (err) {
    return { verdict: 'fail', error: `Claim extraction failed: ${err.message}`, claims: [], results: [] };
  }

  if (claims.length === 0) {
    return { verdict: 'pass', claims: [], results: [] };
  }

  let results;
  try {
    const verifyResp = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 3000,
      temperature: 0,
      system: VERIFY_SYSTEM,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 10,
        allowed_domains: ALLOWED_DOMAINS,
      }],
      messages: [{
        role: 'user',
        content: `Verify these legal/regulatory claims against official UK sources.\n\nClaims:\n${claims.map(c => `${c.id}: ${c.text}`).join('\n')}`,
      }],
    });
    const textBlocks = verifyResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = textBlocks.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    results = parsed.results || [];
  } catch (err) {
    return { verdict: 'fail', error: `Claim verification failed: ${err.message}`, claims, results: [] };
  }

  const resultMap = new Map(results.map(r => [r.id, r]));
  const reconciled = claims.map(c => {
    const r = resultMap.get(c.id);
    if (!r) return { ...c, verdict: 'unverifiable', correction: null, source: null };
    return { ...c, ...r };
  });

  const hasFailure = reconciled.some(r => r.verdict === 'contradicted' || r.verdict === 'unverifiable');

  return {
    verdict: hasFailure ? 'fail' : 'pass',
    claims,
    results: reconciled,
  };
}
