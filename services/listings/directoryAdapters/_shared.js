const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
];

export function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      redirect: 'follow',
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export function randomDelay(minMs = 300, maxMs = 800) {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise(r => setTimeout(r, ms));
}

export function normalisePostcode(raw) {
  if (!raw) return '';
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function extractPostcodeArea(postcode) {
  if (!postcode) return '';
  return postcode.replace(/\s+/g, '').replace(/\d.*$/, '').toUpperCase();
}

export function cityMatch(scrapedAddress, canonicalCity) {
  if (!canonicalCity || !scrapedAddress) return false;
  return scrapedAddress.toLowerCase().includes(canonicalCity.toLowerCase());
}
