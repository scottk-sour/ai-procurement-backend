const REVIEW_MODEL = 'claude-haiku-4-5-20251001';

const REVIEW_SYSTEM_PROMPT = `You are a factual accuracy reviewer for blog posts written by an AI writer agent on behalf of UK regulated professional services firms. Your job is to catch fabricated statistics, invented firm-specific claims, and false attributions.

You receive:
- The draft blog post text
- The firm_context block (the ONLY verified source of firm-specific data)
- The firm's vertical (solicitor / accountant / mortgage-advisor / estate-agent)

Your task: review the draft and return a JSON object with EXACTLY this shape:
{
  "fabricatedAttributions": [
    { "claim": "the exact sentence or phrase", "body": "the named body it's attributed to" }
  ],
  "firmClaimsNotInContext": [
    { "claim": "the exact sentence or phrase" }
  ],
  "qualityScore": <number 0-10>,
  "verdict": "pass" | "fail"
}

Rules for flagging:

FABRICATED ATTRIBUTIONS — flag ANY statistic (a specific number, percentage, monetary value, count, timeframe with a number) attributed to a named third party (regulator, trade body, portal, trade press, government source) whose EXACT figure is NOT present in the firm_context block. Examples:
- "Propertymark data shows homes sell 40% faster" — flag unless firm_context contains this exact claim
- "HMRC figures indicate 61% of..." — flag
- "According to the Law Society, 73%..." — flag
Do NOT flag: qualitative statements without specific numbers ("fees vary widely"), references to publicly known regulatory rules/thresholds (SDLT bands, SRA Transparency Rules requirements), or [FIRM_DATA: ...] placeholder tokens.

FIRM CLAIMS NOT IN CONTEXT — flag ANY firm-specific performance claim (sales counts, completion times, success rates, fee amounts, team sizes, accreditations, awards, service areas, office addresses) that appears as a stated fact but is NOT present in the firm_context block and is NOT inside a [FIRM_DATA: ...] or [FIRM TO PROVIDE: ...] placeholder token. Examples:
- "We sold 87 properties last year" — flag unless firm_context says so
- "Our team of 12 qualified agents" — flag unless firm_context says so
- "We charge 1% + VAT" — flag unless firm_context says so
Do NOT flag [FIRM_DATA: ...] placeholders — those are correct and intentional.

QUALITY SCORE — rate 0-10:
- 10: no fabrication, no unverified claims, well-sourced
- 8-9: minor hedging issues but no fabricated numbers
- 5-7: some unverified claims but no attributed fabrication
- 0-4: fabricated statistics present

VERDICT: "fail" if ANY fabricatedAttributions found, OR ANY firmClaimsNotInContext found, OR qualityScore < 8.5. Otherwise "pass".

Return ONLY the JSON object. No commentary, no markdown fences, no explanation.`;

export async function reviewDraftForFabrication({ draftText, firmContext, vertical }) {
  if (!draftText) {
    return { fabricatedAttributions: [], firmClaimsNotInContext: [], qualityScore: 0, verdict: 'fail', error: 'empty draft' };
  }

  let response;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    response = await client.messages.create({
      model: REVIEW_MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `VERTICAL: ${vertical || 'unknown'}\n\nFIRM CONTEXT:\n${firmContext || '(none provided)'}\n\nDRAFT TO REVIEW:\n${draftText}`,
      }],
    });
  } catch (err) {
    console.error('[FabricationReview] API error:', err.message);
    return {
      fabricatedAttributions: [],
      firmClaimsNotInContext: [],
      qualityScore: 0,
      verdict: 'fail',
      error: `API error: ${err.message}`,
    };
  }

  const raw = response.content
    ?.filter(b => b.type === 'text')
    .map(b => b.text)
    .join('') || '';

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');

    const parsed = JSON.parse(jsonMatch[0]);

    const result = {
      fabricatedAttributions: Array.isArray(parsed.fabricatedAttributions) ? parsed.fabricatedAttributions : [],
      firmClaimsNotInContext: Array.isArray(parsed.firmClaimsNotInContext) ? parsed.firmClaimsNotInContext : [],
      qualityScore: typeof parsed.qualityScore === 'number' ? parsed.qualityScore : 0,
      verdict: parsed.verdict === 'pass' ? 'pass' : 'fail',
    };

    if (result.fabricatedAttributions.length > 0 || result.firmClaimsNotInContext.length > 0 || result.qualityScore < 8.5) {
      result.verdict = 'fail';
    }

    return result;
  } catch (err) {
    console.error('[FabricationReview] Parse error:', err.message, 'Raw:', raw.substring(0, 200));
    return {
      fabricatedAttributions: [],
      firmClaimsNotInContext: [],
      qualityScore: 0,
      verdict: 'fail',
      error: `Parse error: ${err.message}`,
    };
  }
}
