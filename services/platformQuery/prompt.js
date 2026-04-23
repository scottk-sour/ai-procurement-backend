/**
 * Shared prompt builder and response parser for multi-platform AI queries.
 */

import {
  isCompanyMentioned,
  isSameFirm,
  normalizeCompanyName,
} from './nameMatch.js';

/**
 * Build the prompt sent to each AI platform.
 */
export function buildPrompt({ companyName, categoryLabel, city }) {
  return `You are helping a potential customer find a ${categoryLabel} in ${city}, UK.

Your task: Name up to 5 real, specific businesses that provide ${categoryLabel} services in or near ${city}.

STRICT RULES — read carefully:
1. Only name actual businesses with real trading names (e.g. "Smith & Jones Solicitors", "Hughes Accountants Ltd", "Mamba Marketing")
2. Every entry must be a real business name — not advice, not a tip, not a suggestion
3. Do not say "check reviews", "search online", "ask friends", "visit a directory" or any variation of this
4. Do not name directories, comparison sites, or professional bodies (Law Society, ICAEW, etc.)
5. Do not hedge or give generic advice — if you know businesses in this area, name them
6. If ${companyName} is a business you would recommend, include them in your list
7. Format your response as a numbered list: business name first, then one sentence about why

If you genuinely do not know any specific businesses in ${city} that provide ${categoryLabel} services, respond with exactly this and nothing else:
NO_BUSINESSES_FOUND

Do not substitute advice for business names. Do not invent businesses. Only name real firms you have knowledge of.`;
}

/**
 * Validate that a string looks like a real business name, not advice or hedging.
 */
export function isValidBusinessName(name) {
  if (!name || typeof name !== 'string') return false;

  const trimmed = name.trim();

  // Length
  if (trimmed.length < 3 || trimmed.length > 80) return false;

  // Must start with capital letter
  if (!/^[A-Z]/.test(trimmed)) return false;

  // Reject action verb starters
  const junkStarters = [
    'Ask', 'Asking', 'Check', 'Checking', 'Visit', 'Use', 'Using',
    'Consider', 'Search', 'Searching', 'Look', 'Looking', 'Try', 'Trying',
    'Contact', 'Contacting', 'Request', 'Requesting', 'Read', 'Reading',
    'Research', 'Researching', 'Compare', 'Comparing', 'Find', 'Finding',
    'Verify', 'Verifying', 'Ensure', 'Make', 'Be', 'Get', 'Getting',
    'Review', 'Reviewing', 'Seek', 'Seeking', 'Consult', 'Consulting',
    'Hire', 'Hiring', 'Here', 'These', 'Some', 'Many', 'Most', 'Several',
    'Various', 'Multiple', 'Always', 'Never', 'Remember', 'Note',
    'Please', 'However', 'Additionally', 'Furthermore', 'Also',
    'Another', 'Other', 'Reach', 'Speak', 'Talk', 'Call',
    'Email', 'Browse', 'Explore',
  ];

  const firstWord = trimmed.split(/\s+/)[0];
  if (junkStarters.includes(firstWord)) return false;

  // Reject known junk phrases
  const junkPhrases = [
    'law society', 'lawsociety.org', 'friends and family', 'friends or family',
    'estate agent', 'solicitors register', 'sra register', 'fca register',
    'icaew register', 'online review', 'local council', 'bar association',
    'trading standards', 'citizens advice', 'your bank', 'mortgage lender',
    'word of mouth', 'personal recommendation', 'local newspaper',
    'yellow pages', 'yell.com', 'thomson local', 'google review',
    'trustpilot', 'checkatrade', 'rated people', 'which?',
    'depends on your', 'based on your needs', 'here are some',
    'make sure', 'be sure to', 'it is important', 'you should',
    'i would recommend checking', 'i cannot', "i don't", 'i do not',
    'no specific', 'unfortunately', 'not aware of', 'not familiar',
    'cannot provide', 'unable to', 'do not have', 'local directory',
    'professional body', 'trade association', 'regulatory body',
    'comparison site', 'review site', 'listing site',
    'ask your', 'consult your', 'speak to your', 'talk to your',
  ];

  const lowerName = trimmed.toLowerCase();
  if (junkPhrases.some(phrase => lowerName.includes(phrase))) return false;

  // Reject if more than 7 words — real business names are short
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 7) return false;

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(trimmed)) return false;

  // Reject sentence-like structure
  if (/\b(is|are|was|were|will|would|should|could|can|may|might|must|shall|have|has|had)\b/i.test(trimmed)) return false;

  // Reject if contains URL-like patterns
  if (/https?:\/\/|www\.|\.com|\.co\.uk|\.org/i.test(trimmed)) return false;

  // Reject if contains question marks or exclamation marks
  if (/[?!]/.test(trimmed)) return false;

  return true;
}

/**
 * Check if a mention of the company name is a genuine positive mention,
 * not a negation like "I couldn't find", "not mentioned", etc.
 *
 * Locates the mention by finding the normalized company name inside the
 * normalized text. That way we catch variants like "Celtic Frozen Drinks Ltd"
 * when the search term is "Celtic Frozen Drinks" (or vice-versa) instead of
 * bailing out at the strict substring check the way the old implementation
 * did.
 */
function isPositiveMention(text, companyName) {
  const textLower = text.toLowerCase();
  const companyNorm = normalizeCompanyName(companyName);
  if (!companyNorm) return false;

  // Find the mention position in the lower-cased original text so the
  // "100 chars before" negation window operates on real characters. We try
  // the normalized name first, then fall back to the raw lowercased name for
  // cases where normalization stripped something the text kept verbatim.
  let idx = textLower.indexOf(companyNorm);
  if (idx === -1) {
    const rawLower = String(companyName).toLowerCase().trim();
    if (rawLower) idx = textLower.indexOf(rawLower);
  }
  if (idx === -1) return true;

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
 *
 * @param {string} responseText - raw model output
 * @param {string} companyName  - searched firm name
 * @param {Object} [opts]
 * @param {string} [opts.websiteUrl] - searched firm's site, used so a URL
 *   citation (e.g. Perplexity's inline source links) still registers as a
 *   mention even if the model omits the name.
 */
export function parsePlatformResponse(responseText, companyName, opts = {}) {
  if (!responseText) {
    return { mentioned: false, position: null, snippet: null, competitors: [] };
  }

  const response = responseText;
  const websiteUrl = typeof opts === 'string' ? opts : opts?.websiteUrl || null;

  // Handle explicit no-results signal
  if (response.trim() === 'NO_BUSINESSES_FOUND' ||
      /^no_businesses_found$/i.test(response.trim())) {
    return {
      mentioned: false,
      position: null,
      snippet: 'No specific businesses found in this area.',
      competitors: [],
    };
  }

  // Handle if AI ignored instructions and gave generic advice anyway
  const adviceSignals = [
    'i recommend checking', 'i suggest looking', 'i would advise',
    'here are some tips', 'some things to consider', 'when looking for',
    'it\'s important to', 'you should consider', 'make sure to',
    'i don\'t have specific', 'i cannot provide specific',
    'i\'m not aware of specific', 'i don\'t have information about specific',
  ];

  const lowerResponse = response.toLowerCase();
  const isGenericAdvice = adviceSignals.some(signal => lowerResponse.includes(signal));

  if (isGenericAdvice && !isCompanyMentioned(response, companyName, websiteUrl)) {
    return {
      mentioned: false,
      position: null,
      snippet: '',
      competitors: [],
    };
  }

  const text = response;

  // Flexible mention check: normalized substring match against the firm name
  // (case/suffix/diacritic/punctuation-insensitive) plus a URL-citation
  // fallback so we count Perplexity-style inline source links as mentions.
  // Then run the existing negation-context sentiment check to filter out
  // "I could not find X" style false positives.
  const rawMentioned = isCompanyMentioned(text, companyName, websiteUrl);
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
        if (isCompanyMentioned(match[2], companyName, websiteUrl)) {
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
    const mentionSentences = sentences.filter((s) =>
      isCompanyMentioned(s, companyName, websiteUrl),
    );
    if (mentionSentences.length > 0) {
      snippet = mentionSentences.slice(0, 2).join(' ').trim();
      // Clean up markdown bold
      snippet = snippet.replace(/\*\*/g, '').trim();
      // Limit length
      if (snippet.length > 500) snippet = snippet.substring(0, 497) + '...';
    }
  }

  // Extract competitor names and reasons — other companies mentioned in numbered/bulleted items
  const competitors = [];
  // This pattern captures: name (group 1) and the rest of the line as reason (group 2)
  const listItemWithReasonPattern = /(?:^|\n)\s*(?:\d+[.)]\s*\**|[-•*]\s+\**)\s*([^:\n*]+?)(?:\*\*)?(?:\s*[-–:]\s)([^\n]*)/g;
  let match;
  while ((match = listItemWithReasonPattern.exec(text)) !== null) {
    const name = match[1].replace(/\*\*/g, '').trim();
    const reason = (match[2] || '').replace(/\*\*/g, '').trim();
    if (
      name &&
      !isSameFirm(name, companyName) &&
      !competitors.some(c => c.name === name) &&
      isValidBusinessName(name)
    ) {
      competitors.push({ name, reason: reason || null });
    }
  }

  // Second pass: catch list items without a reason separator (name only, no colon/dash)
  if (competitors.length === 0) {
    const listItemNameOnly = /(?:^|\n)\s*(?:\d+[.)]\s*\**|[-•*]\s+\**)\s*([^:\n*]+?)(?:\*\*)?(?:\s*\n)/g;
    let nameMatch;
    while ((nameMatch = listItemNameOnly.exec(text)) !== null) {
      const name = nameMatch[1].replace(/\*\*/g, '').trim();
      if (
        name &&
        !isSameFirm(name, companyName) &&
        !competitors.some(c => c.name === name) &&
        isValidBusinessName(name)
      ) {
        competitors.push({ name, reason: null });
      }
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
        !isSameFirm(name, companyName) &&
        !competitors.some(c => c.name === name) &&
        isValidBusinessName(name)
      ) {
        competitors.push({ name, reason: null });
      }
    }
  }

  // Final false-positive check: if the snippet itself says the firm was NOT found,
  // override to not mentioned (catches cases where AI names the company only to say
  // it couldn't find it).
  let finalMentioned = mentioned;
  if (mentioned && snippet) {
    const snippetLower = snippet.toLowerCase();
    const falsePositivePhrases = [
      'was not mentioned',
      'cannot include it',
      'not found in',
      'does not appear',
      'no results for',
      'i cannot include',
      'not included',
    ];
    if (falsePositivePhrases.some(phrase => snippetLower.includes(phrase))) {
      finalMentioned = false;
    }
  }

  return {
    mentioned: finalMentioned,
    position: finalMentioned ? position : null,
    snippet,
    competitors: competitors.slice(0, 10),
  };
}
