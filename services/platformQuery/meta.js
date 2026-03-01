import Groq from 'groq-sdk';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryMeta({ companyName, categoryLabel, city }) {
  const client = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const prompt = buildPrompt({ companyName, categoryLabel, city });

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  });

  const rawResponse = response.choices?.[0]?.message?.content || '';
  const parsed = parsePlatformResponse(rawResponse, companyName);

  return {
    platform: 'meta',
    platformLabel: 'Meta AI',
    ...parsed,
    rawResponse,
    error: null,
  };
}
