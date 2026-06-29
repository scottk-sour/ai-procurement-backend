import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryGemini({ companyName, categoryLabel, city, websiteUrl }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // The googleSearch tool grounds Gemini against live Google results before
  // answering. Without it, gemini-2.0-flash answers from weights only
  // (non-browsing) and must NOT be counted as a browsing mention.
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }],
  });

  const prompt = buildPrompt({ companyName, categoryLabel, city });
  const result = await model.generateContent(prompt);

  const rawResponse = result.response?.text() || '';

  // groundingMetadata exists ONLY when Gemini actually grounded against search.
  // This is the proof the answer is browsing-sourced.
  const groundingMetadata = result.response?.candidates?.[0]?.groundingMetadata || null;

  const parsed = parsePlatformResponse(rawResponse, companyName, { websiteUrl });

  return {
    platform: 'gemini',
    platformLabel: 'Gemini',
    ...parsed,
    browsed: Boolean(groundingMetadata),
    citations: groundingMetadata?.groundingChunks || [],
    rawResponse,
    error: null,
  };
}
