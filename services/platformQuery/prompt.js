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
 * Parse an AI platform's response to extract mention data.
 */
export function parsePlatformResponse(responseText, companyName) {
  if (!responseText) {
    return { mentioned: false, position: null, snippet: null, competitors: [] };
  }

  const text = responseText;
  const companyLower = companyName.toLowerCase();

  // Check if the company is mentioned (case-insensitive, partial match)
  const mentioned = text.toLowerCase().includes(companyLower);

  // Try to determine position from numbered lists or order of appearance
  let position = null;
  if (mentioned) {
    // Try numbered list patterns: "1. CompanyName", "1) CompanyName", "#1 CompanyName"
    const numberedPatterns = [
      /(?:^|\n)\s*(\d+)[.)]\s*\**\s*([^\n*]+)/g,
      /(?:^|\n)\s*#(\d+)\s+([^\n]+)/g,
    ];

    for (const pattern of numberedPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const lineText = match[2].toLowerCase();
        if (lineText.includes(companyLower)) {
          position = parseInt(match[1], 10);
          break;
        }
      }
      if (position !== null) break;
    }

    // If no numbered position found, try order of appearance among company-like mentions
    if (position === null) {
      const lines = text.split('\n').filter(l => l.trim());
      let order = 0;
      for (const line of lines) {
        // Lines that look like they mention a company (contain bold, bullet, or start with text)
        if (line.match(/^\s*[-•*]\s+/) || line.match(/^\s*\d+[.)]/)) {
          order++;
          if (line.toLowerCase().includes(companyLower)) {
            position = order;
            break;
          }
        }
      }
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
