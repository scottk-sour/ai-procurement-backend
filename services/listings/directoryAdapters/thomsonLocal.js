import { isSameFirm } from '../../platformQuery/nameMatch.js';
import { fetchWithTimeout, randomDelay, normalisePostcode, cityMatch } from './_shared.js';

function parseResults(html) {
  const results = [];
  const pattern = /<div[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const block = m[1];
    const nameMatch = block.match(/<a[^>]*class="[^"]*listing__name[^"]*"[^>]*>([^<]+)<\/a>/i)
                   || block.match(/<h[23][^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
    const addrMatch = block.match(/<span[^>]*class="[^"]*address[^"]*"[^>]*>([^<]+)<\/span>/i)
                   || block.match(/<p[^>]*class="[^"]*listing__address[^"]*"[^>]*>([^<]+)<\/p>/i);
    const phoneMatch = block.match(/<span[^>]*class="[^"]*phone[^"]*"[^>]*>([^<]+)<\/span>/i)
                    || block.match(/tel[^"]*">([0-9\s+()-]+)</i);
    const linkMatch = block.match(/<a[^>]*href="(https:\/\/www\.thomsonlocal\.com\/[^"]+)"/i)
                   || block.match(/<a[^>]*href="(\/[^"]+)"/i);

    if (nameMatch) {
      results.push({
        name: nameMatch[1].trim(),
        address: addrMatch ? addrMatch[1].trim() : '',
        phone: phoneMatch ? phoneMatch[1].trim() : '',
        postcode: '',
        url: linkMatch ? (linkMatch[1].startsWith('http') ? linkMatch[1] : `https://www.thomsonlocal.com${linkMatch[1]}`) : null,
      });
    }
  }

  if (results.length === 0) {
    const fallback = /<h[23][^>]*>\s*<a[^>]*>([^<]+)<\/a>\s*<\/h[23]>/gi;
    while ((m = fallback.exec(html)) !== null) {
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
  const dir = 'thomson_local';
  try {
    await randomDelay();
    const query = encodeURIComponent(canonicalNap.name);
    const location = encodeURIComponent(canonicalNap.postcode || canonicalNap.address?.split(',').pop()?.trim() || '');
    const url = `https://www.thomsonlocal.com/search/${query}/${location}`;

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

    if (!best) return { directory: dir, found: false, confidence: 0, listingUrl: null, scraped: null, error: null };
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
