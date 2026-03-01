import OpenAI from 'openai';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryGrok({ companyName, categoryLabel, city }) {
  const client = new OpenAI({
    apiKey: process.env.GROK_API_KEY,
    baseURL: 'https://api.x.ai/v1',
  });

  const prompt = buildPrompt({ companyName, categoryLabel, city });

  const response = await client.chat.completions.create({
    model: 'grok-3-mini-fast',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  });

  const rawResponse = response.choices?.[0]?.message?.content || '';
  const parsed = parsePlatformResponse(rawResponse, companyName);

  return {
    platform: 'grok',
    platformLabel: 'Grok',
    ...parsed,
    rawResponse,
    error: null,
  };
}
