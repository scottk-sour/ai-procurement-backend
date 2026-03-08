/**
 * Shared prompt builder and response parser for multi-platform AI queries.
 */

/**
 * Build the prompt sent to each AI platform.
 */
export function buildPrompt({ companyName, categoryLabel, city }) {
  return `A potential customer asks: "Can you recommend a good ${categoryLabel} in ${city}?"

List up to 5 specific companies you'd recommend, with a brief reason for each.
If you would include ${companyName}, include it in your list.
Respond in plain text, not JSON.`;
}

/**
 * Check if a mention of the company name is a genuine positive mention,
 * not a negation like "I couldn't find", "not mentioned", etc.
 */
function isPositiveMention(text, companyName) {
  const companyLower = companyName.toLowerCase();
  const textLower = text.toLowerCase();
  const idx = textLower.indexOf(companyLower);
  if (idx === -1) return false;

  // Check the surrounding context (100 chars before the mention)
  const before = textLower.substring(Math.max(0, idx - 100), idx);

  const negationPatterns = [
    /(?:do(?:es)?n[''']?t|does not|do not|did not|didn[''']?t|cannot|can[''']?t|couldn[''']?t|could not)\s+(?:mention|include|recommend|find|list|know|have|feature|reference|recogni[sz]e)/,
    /(?:not? (?:mention|include|recommend|find|list|feature|reference))/,
    /(?:no (?:mention|information|data|results?|record))/,
    /(?:wasn[''']?t|weren[''']?t|isn[''']?t|aren[''']?t)\s+(?:mentioned|included|recommended|found|listed|featured)/,
    /(?:unable to (?:find|locate|identify|verify))/,
    /(?:not (?:among|one of|in|part of|included|listed|featured|mentioned|recommended))/,
    /(?:unfortunately|however|sadly),?\s+/,
    /(?:search results? (?:do not|don[''']?t) (?:mention|include))/,
    /(?:not appear|does not appear|didn[''']?t appear)/,
    /(?:could not be found|was not found)/,
    /(?:i (?:could|can)(?:n[''']?t| not) (?:find|locate|verify|confirm))/,
  ];

  for (const pattern of negationPatterns) {
    if (pattern.test(before)) return false;
  }

  return true;
}

/**
 * Parse an AI platform's response to extract mention data.
 */
export function parsePlatformResponse(responseText, companyName) {
  if (!responseText) {
    return { mentioned: false, position: null, snippet: null, competitors: [] };
  }

  const text = responseText;
  const companyLower = companyName.toLowerCase();

  // Check if the company is mentioned (case-insensitive, partial match)
  // Filter out negative/false mentions
  const rawMentioned = text.toLowerCase().includes(companyLower);
  const mentioned = rawMentioned ? isPositiveMention(text, companyName) : false;

  // Try to determine position from explicitly numbered lists only.
  // We only assign position when the company appears in a clear "1. Name" or "1) Name"
  // pattern. Fallback order-of-appearance is too unreliable so we skip it —
  // a null position simply means "mentioned" without a rank.
  let position = null;
  if (mentioned) {
    const numberedPatterns = [
      /(?:^|\n)\s*(\d+)[.)]\s*\**\s*([^\n*]+)/g,
      /(?:^|\n)\s*#(\d+)\s+([^\n]+)/g,
    ];

    for (const pattern of numberedPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const lineText = match[2].toLowerCase();
        if (lineText.includes(companyLower)) {
          const num = parseInt(match[1], 10);
          // Sanity check: position should be 1-10
          if (num >= 1 && num <= 10) {
            position = num;
          }
          break;
        }
      }
      if (position !== null) break;
    }
  }

  // Extract snippet — the sentence or paragraph mentioning the company
  let snippet = null;
  if (mentioned) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const mentionSentences = sentences.filter(s =>
      s.toLowerCase().includes(companyLower)
    );
    if (mentionSentences.length > 0) {
      snippet = mentionSentences.slice(0, 2).join(' ').trim();
      // Clean up markdown bold
      snippet = snippet.replace(/\*\*/g, '').trim();
      // Limit length
      if (snippet.length > 500) snippet = snippet.substring(0, 497) + '...';
    }
  }

  // Extract competitor names — other companies mentioned in numbered/bulleted items
  const competitors = [];
  const listItemPattern = /(?:^|\n)\s*(?:\d+[.)]\s*\**|[-•*]\s+\**)\s*([^:\n*]+?)(?:\*\*)?(?:\s*[-–:]\s|\s*\n)/g;
  let match;
  while ((match = listItemPattern.exec(text)) !== null) {
    const name = match[1].replace(/\*\*/g, '').trim();
    if (
      name &&
      name.length > 1 &&
      name.length < 100 &&
      !name.toLowerCase().includes(companyLower) &&
      !competitors.includes(name)
    ) {
      competitors.push(name);
    }
  }

  // Fallback: try simpler bold name extraction "**Name**"
  if (competitors.length === 0) {
    const boldPattern = /\*\*([^*]+)\*\*/g;
    let boldMatch;
    while ((boldMatch = boldPattern.exec(text)) !== null) {
      const name = boldMatch[1].trim();
      if (
        name &&
        name.length > 1 &&
        name.length < 100 &&
        !name.toLowerCase().includes(companyLower) &&
        !competitors.includes(name)
      ) {
        competitors.push(name);
      }
    }
  }

  return {
    mentioned,
    position,
    snippet,
    competitors: competitors.slice(0, 10),
  };
}
