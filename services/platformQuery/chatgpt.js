import OpenAI from 'openai';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryChatGPT({ companyName, categoryLabel, city }) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = buildPrompt({ companyName, categoryLabel, city });

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  });

  const rawResponse = response.choices?.[0]?.message?.content || '';
  const parsed = parsePlatformResponse(rawResponse, companyName);

  return {
    platform: 'chatgpt',
    platformLabel: 'ChatGPT',
    ...parsed,
    rawResponse,
    error: null,
  };
}
