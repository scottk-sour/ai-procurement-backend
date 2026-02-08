// utils/nluParser.js
// NLU parser using OpenAI gpt-4o-mini to extract structured fields from free-text queries

import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 5000 });

/**
 * Parse a free-text procurement query into structured fields using GPT-4o-mini.
 * Fast model, JSON response format, 3-second timeout with graceful fallback.
 *
 * @param {string} query - The free-text query from the user
 * @param {string} category - Optional category hint (e.g. "Photocopiers")
 * @returns {Object|null} - Extracted fields or null on failure/timeout
 */
export async function parseQueryWithNLU(query, category) {
  if (!query || query.trim().length < 3) return null;

  const prompt = `Extract procurement requirements from this query. Return JSON only.
Category: ${category || 'unknown'}
Query: "${query}"

Return a JSON object with ONLY fields that are explicitly mentioned:
{
  "category": "Photocopiers|Telecoms|CCTV|IT" (if mentioned),
  "postcode": "extracted UK postcode" (if mentioned),
  "volume": number (monthly print volume, if mentioned),
  "colour": true/false (if colour/mono preference mentioned),
  "a3": true/false (if A3 paper mentioned),
  "features": ["feature1"] (if specific features mentioned),
  "numberOfUsers": number (for Telecoms/IT),
  "numberOfCameras": number (for CCTV),
  "systemType": string (e.g. "Cloud VoIP", "Fully Managed"),
  "budget": number (monthly budget if mentioned),
  "urgency": "Immediately|Within 1 month|Within 3 months" (if timeline mentioned)
}

Only include fields with clear evidence. Omit uncertain fields.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const completion = await client.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 300,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);
    const parsed = JSON.parse(completion.choices[0].message.content);
    return parsed;
  } catch (err) {
    // Silent fallback — NLU is enhancement, not critical path
    console.warn('NLU parse failed, using structured params only:', err.message);
    return null;
  }
}
