export async function auditClaims(vendor, anthropicClient, openaiClient) {
  const queries = [
    `What does ${vendor.company} specialise in?`,
    `Where is ${vendor.company} based?`,
    `What services does ${vendor.company} offer?`,
  ];

  const claims = [];

  for (const query of queries) {
    const responses = await Promise.allSettled([
      anthropicClient ? queryAnthropic(anthropicClient, query) : Promise.resolve(''),
      openaiClient ? queryOpenAI(openaiClient, query) : Promise.resolve(''),
      queryPerplexity(query),
    ]);

    responses.forEach((res, idx) => {
      if (res.status !== 'fulfilled' || !res.value) return;
      const engine = ['Anthropic Claude', 'ChatGPT (via OpenAI)', 'Perplexity'][idx];
      const detected = detectInaccurateClaims(res.value, vendor);
      claims.push(...detected.map(d => ({ ...d, sourceEngine: engine })));
    });
  }

  return claims.slice(0, 5);
}

function detectInaccurateClaims(aiResponse, vendor) {
  const claims = [];
  const text = aiResponse.toLowerCase();
  const city = vendor.location?.city;

  if (city && text.includes('based in') && !text.includes(city.toLowerCase())) {
    const match = text.match(/based in ([a-z\s]+)/);
    if (match) {
      claims.push({
        claim: `AI states the firm is "${match[0]}"`,
        truth: `Firm is based in ${city}`,
        severity: 'high',
      });
    }
  }

  const specialisations = vendor.practiceAreas || [];
  if (specialisations.length > 0) {
    const realSpecs = specialisations.map(s => s.toLowerCase());
    const aiSpecs = extractSpecialisations(text, vendor.vendorType);
    const incorrect = aiSpecs.filter(s =>
      !realSpecs.some(real => real.includes(s) || s.includes(real))
    );
    incorrect.forEach(s => {
      claims.push({
        claim: `AI describes the firm as specialising in "${s}"`,
        truth: `Actual specialisations: ${specialisations.join(', ')}`,
        severity: 'medium',
      });
    });
  }

  return claims;
}

function extractSpecialisations(text, vertical) {
  const verticalKeywords = {
    solicitor: ['conveyancing', 'family law', 'criminal', 'commercial', 'personal injury', 'wills', 'probate', 'employment'],
    accountant: ['tax', 'audit', 'payroll', 'bookkeeping', 'self-assessment', 'vat'],
    'mortgage-advisor': ['first-time buyer', 'remortgage', 'buy-to-let', 'commercial mortgage'],
    'estate-agent': ['sales', 'lettings', 'commercial', 'luxury', 'first-time buyers'],
    'office-equipment': ['photocopiers', 'managed print', 'multi-function'],
  };
  const keywords = verticalKeywords[vertical] || [];
  return keywords.filter(k => text.includes(k));
}

async function queryAnthropic(client, prompt) {
  try {
    const resp = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 200, messages: [{ role: 'user', content: prompt }] });
    return resp.content[0]?.text || '';
  } catch (e) { console.error('Claim audit Anthropic error:', e.message); return ''; }
}

async function queryOpenAI(client, prompt) {
  try {
    const resp = await client.chat.completions.create({ model: 'gpt-4o', max_tokens: 200, messages: [{ role: 'user', content: prompt }] });
    return resp.choices[0]?.message?.content || '';
  } catch (e) { console.error('Claim audit OpenAI error:', e.message); return ''; }
}

async function queryPerplexity(prompt) {
  if (!process.env.PERPLEXITY_API_KEY) return '';
  try {
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonar-pro', max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (e) { console.error('Claim audit Perplexity error:', e.message); return ''; }
}

export { detectInaccurateClaims };
