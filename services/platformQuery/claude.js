import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryClaude({ companyName, categoryLabel, city }) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = buildPrompt({ companyName, categoryLabel, city });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawResponse = response.content?.[0]?.type === 'text'
    ? response.content[0].text
    : '';
  const parsed = parsePlatformResponse(rawResponse, companyName);

  return {
    platform: 'claude',
    platformLabel: 'Claude',
    ...parsed,
    rawResponse,
    error: null,
  };
}
