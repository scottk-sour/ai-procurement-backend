import OpenAI from 'openai';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryChatGPT({ companyName, categoryLabel, city, websiteUrl }) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = buildPrompt({ companyName, categoryLabel, city });

  // gpt-5-search-api-2025-10-14 performs a live web search before answering.
  // Pinned snapshot (not the -search-api alias) so browsing behaviour and the
  // url_citation annotation shape stay fixed across OpenAI releases. A
  // non-browsing model must NOT be counted as a browsing mention. Supported on
  // the chat.completions endpoint in openai SDK v4.x.
  let response;
  try {
    response = await client.chat.completions.create({
      model: 'gpt-5-search-api-2025-10-14',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    });
  } catch (err) {
    // Never fall through to an empty result that scores as "not mentioned".
    // A failed call is an explicit error state: mentioned:null, error set.
    return {
      platform: 'chatgpt',
      platformLabel: 'ChatGPT',
      mentioned: null,
      position: null,
      snippet: null,
      competitors: [],
      browsed: false,
      citations: [],
      rawResponse: null,
      error: err.message,
    };
  }

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
