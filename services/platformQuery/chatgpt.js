import OpenAI from 'openai';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryChatGPT({ companyName, categoryLabel, city, websiteUrl }) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = buildPrompt({ companyName, categoryLabel, city });

  // gpt-4o-mini-search-preview performs a live web search before answering.
  // A plain gpt-4o-mini answers from training weights only (non-browsing) and
  // must NOT be counted as a browsing mention. This model is supported on the
  // chat.completions endpoint in openai SDK v4.x (your version is 4.80.1).
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini-search-preview',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  });

  const message = response.choices?.[0]?.message;
  const rawResponse = message?.content || '';

  // annotations exist ONLY when the model actually searched the web.
  // This is the proof the answer is browsing-sourced.
  const annotations = message?.annotations || [];

  const parsed = parsePlatformResponse(rawResponse, companyName, { websiteUrl });

  return {
    platform: 'chatgpt',
    platformLabel: 'ChatGPT',
    ...parsed,
    browsed: annotations.length > 0,
    citations: annotations,
    rawResponse,
    error: null,
  };
}
