import { isSameFirm } from '../../platformQuery/nameMatch.js';
import { fetchWithTimeout, randomDelay, normalisePostcode, cityMatch } from './_shared.js';

function parseResults(html) {
  const results = [];
  const listingPattern = /<div[^>]*class="[^"]*businessCapsule[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let m;
  while ((m = listingPattern.exec(html)) !== null) {
    const block = m[1];
    const nameMatch = block.match(/<a[^>]*class="[^"]*businessCapsule--name[^"]*"[^>]*>([^<]+)<\/a>/i)
                   || block.match(/<h2[^>]*>([^<]+)<\/h2>/i)
                   || block.match(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/i);
    const addrMatch = block.match(/<span[^>]*class="[^"]*address[^"]*"[^>]*>([^<]+)<\/span>/i)
                   || block.match(/<address[^>]*>([^<]+)<\/address>/i);
    const phoneMatch = block.match(/<span[^>]*class="[^"]*telephone[^"]*"[^>]*>([^<]+)<\/span>/i)
                    || block.match(/tel[^"]*"[^>]*>([0-9\s+()-]+)</i);
    const linkMatch = block.match(/<a[^>]*href="(\/biz\/[^"]+)"/i);

    if (nameMatch) {
      results.push({
        name: nameMatch[1].trim(),
        address: addrMatch ? addrMatch[1].trim() : '',
        phone: phoneMatch ? phoneMatch[1].trim() : '',
        postcode: '',
        url: linkMatch ? `https://www.yell.com${linkMatch[1]}` : null,
      });
    }
  }

  if (results.length === 0) {
    const fallbackName = /<h2[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi;
    while ((m = fallbackName.exec(html)) !== null) {
      results.push({ name: m[1].trim(), address: '', phone: '', postcode: '', url: null });
    }
  }

  for (const r of results) {
    const pcMatch = r.address.match(/([A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2})/i);
    if (pcMatch) r.postcode = pcMatch[1];
  }

  return results;
}

export async function checkPresence(canonicalNap) {
  const dir = 'yell';
  try {
    await randomDelay();
    const query = encodeURIComponent(canonicalNap.name);
    const location = encodeURIComponent(canonicalNap.postcode || canonicalNap.address?.split(',').pop()?.trim() || '');
    const url = `https://www.yell.com/ucs/UcsSearchAction.do?scrambleSeed=&keywords=${query}&location=${location}`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      return { directory: dir, found: null, confidence: 0, listingUrl: null, scraped: null, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const candidates = parseResults(html);

    let best = null;
    let bestConf = 0;

    for (const c of candidates) {
      if (!isSameFirm(c.name, canonicalNap.name)) continue;
      let conf = 0.5;
      if (c.postcode && normalisePostcode(c.postcode) === normalisePostcode(canonicalNap.postcode)) {
        conf = 1.0;
      } else if (cityMatch(c.address, canonicalNap.address?.split(',')[0]?.trim())) {
        conf = 0.7;
      }
      if (conf > bestConf) { best = c; bestConf = conf; }
    }

    if (!best) return { directory: dir, found: null, confidence: 0, listingUrl: null, scraped: null, error: 'no matching candidate in parsed results' };
    if (bestConf < 0.7) return { directory: dir, found: null, confidence: bestConf, listingUrl: best.url, scraped: best, error: null };

    return {
      directory: dir, found: true, confidence: bestConf,
      listingUrl: best.url,
      scraped: { name: best.name, address: best.address, postcode: best.postcode, phone: best.phone },
      error: null,
    };
  } catch (err) {
    return { directory: dir, found: null, confidence: 0, listingUrl: null, scraped: null, error: err.message };
  }
}
