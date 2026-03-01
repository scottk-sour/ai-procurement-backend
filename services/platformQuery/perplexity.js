import OpenAI from 'openai';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryPerplexity({ companyName, categoryLabel, city }) {
  const client = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: 'https://api.perplexity.ai',
  });

  const prompt = buildPrompt({ companyName, categoryLabel, city });

  const response = await client.chat.completions.create({
    model: 'sonar',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  });

  const rawResponse = response.choices?.[0]?.message?.content || '';
  const parsed = parsePlatformResponse(rawResponse, companyName);

  return {
    platform: 'perplexity',
    platformLabel: 'Perplexity',
    ...parsed,
    rawResponse,
    error: null,
  };
}
