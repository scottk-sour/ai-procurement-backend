// Add a platform here ONLY after scripts/verify-browsing.js shows browsed=true.
// chatgpt: verified browsing live (gpt-5-search-api-2025-10-14, url_citation
//   annotations present) — Aug 2026. Previous model gpt-4o-mini-search-preview
//   was retired by OpenAI (every call 404'd).
// gemini: NOT added — GEMINI_API_KEY invalid in Render env. Re-verify once the key is fixed.
export const BROWSING_PLATFORMS = ['perplexity', 'chatgpt'];
