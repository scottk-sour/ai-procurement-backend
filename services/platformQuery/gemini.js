import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildPrompt, parsePlatformResponse } from './prompt.js';

export async function queryGemini({ companyName, categoryLabel, city }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = buildPrompt({ companyName, categoryLabel, city });

  const result = await model.generateContent(prompt);
  const rawResponse = result.response?.text() || '';
  const parsed = parsePlatformResponse(rawResponse, companyName);

  return {
    platform: 'gemini',
    platformLabel: 'Gemini',
    ...parsed,
    rawResponse,
    error: null,
  };
}
