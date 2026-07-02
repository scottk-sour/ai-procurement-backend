import { extractFirstJsonObject } from '../contentReview/jsonExtract.js';

const REVIEW_MODEL = 'claude-haiku-4-5-20251001';

const REVIEW_SYSTEM_PROMPT = `You are a factual accuracy reviewer for blog posts written by an AI writer agent on behalf of UK regulated professional services firms. Your job is to catch fabricated statistics and invented claims.

You receive:
- The draft blog post text
- The firm_context block (the ONLY verified source of firm-specific data)
- The firm's vertical (solicitor / accountant / mortgage-advisor / estate-agent)

Return a JSON object with EXACTLY this shape:
{
  "fabricatedAttributions": [
    { "claim": "the exact sentence or phrase", "body": "the named or anonymous source" }
  ],
  "firmClaimsNotInContext": [
    { "claim": "the exact sentence or phrase" }
  ],
  "qualityScore": <number 0-10>,
  "verdict": "pass" | "fail"
}

FABRICATED ATTRIBUTIONS — flag ANY of these:
1. A specific number, percentage, monetary value, count, or timeline attributed to a NAMED organisation (Propertymark, NAEA, RICS, Land Registry, Rightmove, SRA, ICAEW, FCA, HMRC, ONS, etc.) whose exact figure is NOT in firm_context.
2. A specific number attributed to an ANONYMOUS source: "market data shows", "analysis indicates", "sales data suggests", "Cardiff market analysis shows", "industry research" — anonymous attribution is fabrication.
3. Any specific statistic, percentage, or timeline that appears as factual prose but has no source in firm_context — even without an attribution phrase.

Examples to FLAG:
- "Propertymark data shows homes sell 40% faster" — named attribution + invented figure
- "Cardiff market analysis shows spring generates 35% more enquiries" — anonymous attribution
- "Chain complications account for approximately 15% of delays" — unsourced specific figure
- "Properties typically sell within 28 days" — specific timeline not in firm_context

Do NOT flag:
- Purely qualitative statements with no numbers: "overpriced properties take longer to sell"
- GENERIC third-person category statements with no figure and no firm attribution: "solicitors regulated by the SRA must…", "Propertymark-registered agents are required to…"
- But DO flag if the firm claims ITS OWN membership/registration/qualification/accreditation ("we are Propertymark-registered", "our NAEA-qualified staff") and this is NOT confirmed in firm_context — add it to firmClaimsNotInContext
- Regulatory rules/thresholds that are public law: SDLT bands, stamp duty rates
- [FIRM_DATA: ...] or [FIRM TO PROVIDE: ...] placeholder tokens — these are intentional honest gap markers, the opposite of fabrication. Never flag them.

FIRM CLAIMS NOT IN CONTEXT — flag any firm-specific performance claim (sales counts, fee amounts, team sizes, accreditations, awards, specific service areas) stated as fact that is NOT in firm_context.

QUALITY SCORE:
- 9-10: statistic-free qualitative content, well-written
- 7-8: mostly qualitative with minor hedging issues
- 4-6: contains some unsourced specific claims
- 0-3: multiple fabricated statistics

VERDICT: "fail" if ANY fabricatedAttributions, OR ANY firmClaimsNotInContext, OR qualityScore < 8.5.

Return ONLY the JSON object.`;

async function callReviewOnce(client, draftText, firmContext, vertical) {
  const response = await client.messages.create({
    model: REVIEW_MODEL,
    max_tokens: 3000,
    temperature: 0,
    system: REVIEW_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `VERTICAL: ${vertical || 'unknown'}\n\nFIRM CONTEXT:\n${firmContext || '(none provided)'}\n\nDRAFT TO REVIEW:\n${draftText}`,
    }],
  });

  const raw = response.content
    ?.filter(b => b.type === 'text')
    .map(b => b.text)
    .join('') || '';

  const obj = extractFirstJsonObject(raw);
  if (!obj) throw new Error('No complete JSON object in response');
  return JSON.parse(obj);
}

export async function reviewDraftForFabrication({ draftText, firmContext, vertical }) {
  if (!draftText) {
    return { fabricatedAttributions: [], firmClaimsNotInContext: [], qualityScore: 0, verdict: 'fail', error: 'empty draft', reviewRan: false };
  }

  let client;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (err) {
    console.error('[FabricationReview] SDK init error:', err.message);
    return { fabricatedAttributions: [], firmClaimsNotInContext: [], qualityScore: 0, verdict: 'fail', error: `SDK init: ${err.message}`, reviewRan: false };
  }

  let parsed;
  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      parsed = await callReviewOnce(client, draftText, firmContext, vertical);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      console.error(`[FabricationReview] Attempt ${attempt + 1} failed:`, err.message);
    }
  }

  if (lastError || !parsed) {
    console.error('[FabricationReview] Both attempts failed:', lastError?.message);
    return {
      fabricatedAttributions: [],
      firmClaimsNotInContext: [],
      qualityScore: 0,
      verdict: 'fail',
      error: `Review could not run after 2 attempts: ${lastError?.message}`,
      reviewRan: false,
    };
  }

  const containsPlaceholder = (text) => /\[FIRM_DATA:|\[FIRM TO PROVIDE:/i.test(text || '');

  const rawAttribs = Array.isArray(parsed.fabricatedAttributions) ? parsed.fabricatedAttributions : [];
  const rawFirmClaims = Array.isArray(parsed.firmClaimsNotInContext) ? parsed.firmClaimsNotInContext : [];

  const result = {
    fabricatedAttributions: rawAttribs.filter(a => !containsPlaceholder(a.claim) && !containsPlaceholder(a.body)),
    firmClaimsNotInContext: rawFirmClaims.filter(c => !containsPlaceholder(c.claim)),
    qualityScore: typeof parsed.qualityScore === 'number' ? parsed.qualityScore : 0,
    verdict: parsed.verdict === 'pass' ? 'pass' : 'fail',
    reviewRan: true,
  };

  if (result.fabricatedAttributions.length > 0 || result.firmClaimsNotInContext.length > 0 || result.qualityScore < 8.5) {
    result.verdict = 'fail';
  }

  return result;
}
