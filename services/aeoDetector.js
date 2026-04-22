import axios from 'axios';

/** Approved blog path list, in priority order. First hit wins. */
export const BLOG_PATHS = [
  '/blog',
  '/blogs',
  '/resources',
  '/insights',
  '/news',
  '/articles',
  '/guides',
  '/knowledge',
  '/knowledge-hub',
  '/learn',
  '/library',
];

/** Per-probe timeout for blog detection network calls. */
export const BLOG_PROBE_TIMEOUT_MS = 5000;

/** Approved pricing-page paths. Anchors to any of these (or deeper) on the home page get fetched. */
export const PRICING_PATHS = ['/pricing', '/fees', '/costs', '/plans', '/prices'];

/** Path prefixes that indicate a "service" or "practice area" sub-page. */
export const SERVICE_PATH_PREFIXES = ['/services', '/practice-areas', '/what-we-do', '/expertise'];

export const SUBPAGE_PROBE_TIMEOUT_MS = 5000;

/** Minimum word count (visible text) that makes a service page count as "detailed". */
export const SERVICE_MIN_WORDS = 300;

/** Minimum distinct "£ + number" matches on a single page to count as pricing shown. */
export const PRICING_MIN_SIGNALS = 2;

/** Max linked sub-pages fetched when evaluating detailed service pages. Upper bound on blast radius. */
export const SERVICE_MAX_PROBES = 8;

export const BLOG_DETECTION_DEFAULT = Object.freeze({
  hasBlog: false,
  blogUrl: null,
  detectedVia: null,
});

/**
 * Extract href values from anchor tags. Good enough for detection — not a full HTML parser.
 */
export function extractHrefs(html) {
  const hrefs = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    hrefs.push(m[1]);
  }
  return hrefs;
}

/**
 * Resolve href against origin, return normalized lowercase pathname when same-origin, else null.
 * Trailing slash stripped for paths longer than 1 char.
 */
export function resolveSameOriginPath(href, origin) {
  try {
    const abs = new URL(href, origin);
    if (abs.origin !== origin) return null;
    let p = abs.pathname;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Pass 1: scan home-page HTML for anchor hrefs matching approved blog paths.
 */
export function detectBlogFromHtml(html, origin) {
  const paths = new Set();
  for (const href of extractHrefs(html)) {
    const p = resolveSameOriginPath(href, origin);
    if (p) paths.add(p);
  }
  for (const blogPath of BLOG_PATHS) {
    if (paths.has(blogPath)) {
      return { hasBlog: true, blogUrl: `${origin}${blogPath}`, detectedVia: 'html' };
    }
  }
  return null;
}

/**
 * Pass 2: sequential HEAD-then-GET probe of each approved path on the given origin.
 * Stops at the first 2xx response.
 */
export async function detectBlogFromProbes(origin) {
  for (const blogPath of BLOG_PATHS) {
    const url = `${origin}${blogPath}`;
    const opts = {
      timeout: BLOG_PROBE_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { 'User-Agent': 'TendorAI-AEO-Audit/1.0' },
    };
    try {
      await axios.head(url, opts);
      return { hasBlog: true, blogUrl: url, detectedVia: 'path-probe' };
    } catch {
      // HEAD may be disallowed (405, 501) or refused; fall through to GET.
    }
    try {
      await axios.get(url, opts);
      return { hasBlog: true, blogUrl: url, detectedVia: 'path-probe' };
    } catch {
      // continue to next path
    }
  }
  return null;
}

/**
 * Extract <loc> values from a sitemap XML string.
 */
export function extractSitemapLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1]);
  }
  return locs;
}

/**
 * Pass 3: fetch sitemap.xml and look for a URL strictly longer than any approved
 * blog prefix. Index-only entries (/blog, /blog/) do not count.
 */
export async function detectBlogFromSitemap(origin) {
  let xml;
  try {
    const resp = await axios.get(`${origin}/sitemap.xml`, {
      timeout: BLOG_PROBE_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { 'User-Agent': 'TendorAI-AEO-Audit/1.0' },
    });
    xml = typeof resp.data === 'string' ? resp.data : '';
  } catch {
    return null;
  }
  if (!xml) return null;

  let locs = extractSitemapLocs(xml);

  // Sitemap-index: follow the first child sitemap (one hop only, correctness-first).
  if (/<sitemapindex[\s>]/i.test(xml) && locs.length > 0) {
    try {
      const childResp = await axios.get(locs[0], {
        timeout: BLOG_PROBE_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 300,
        headers: { 'User-Agent': 'TendorAI-AEO-Audit/1.0' },
      });
      const childXml = typeof childResp.data === 'string' ? childResp.data : '';
      locs = extractSitemapLocs(childXml);
    } catch {
      return null;
    }
  }

  const paths = [];
  for (const loc of locs) {
    const p = resolveSameOriginPath(loc, origin);
    if (p) paths.push(p);
  }

  for (const prefix of BLOG_PATHS) {
    for (const p of paths) {
      if (p.startsWith(`${prefix}/`) && p.length > prefix.length + 1) {
        return { hasBlog: true, blogUrl: `${origin}${p}`, detectedVia: 'sitemap' };
      }
    }
  }
  return null;
}

/**
 * Detect whether the vendor site has a blog.
 * Three sequential passes: HTML anchor scan, path probe, sitemap parse.
 * First positive hit wins; any uncaught error returns the all-false default.
 */
export async function detectBlog(origin, html) {
  try {
    const fromHtml = detectBlogFromHtml(html || '', origin);
    if (fromHtml) return fromHtml;

    const fromProbes = await detectBlogFromProbes(origin);
    if (fromProbes) return fromProbes;

    const fromSitemap = await detectBlogFromSitemap(origin);
    if (fromSitemap) return fromSitemap;

    return { ...BLOG_DETECTION_DEFAULT };
  } catch {
    return { ...BLOG_DETECTION_DEFAULT };
  }
}

/**
 * Fetch a single sub-page as text. Never throws — returns '' on any failure
 * so pricing/service detection can treat an unreachable sub-page the same as
 * a missing one without bubbling up a report-killing error.
 */
async function fetchSubpageHtml(url) {
  try {
    const resp = await axios.get(url, {
      timeout: SUBPAGE_PROBE_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { 'User-Agent': 'TendorAI-AEO-Audit/1.0', Accept: 'text/html' },
    });
    return typeof resp.data === 'string' ? resp.data : '';
  } catch {
    return '';
  }
}

/** Strip scripts/styles, keep everything else intact — callers normalise further. */
function stripScripts(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}

/** Visible-text word count. Shared shape with check #10 in analyseAeoSignals. */
function countWords(html) {
  const text = stripScripts(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

/**
 * Count distinct "£ + number" occurrences on a single page. "£299" and "£ 299"
 * collapse to the same signal; "£299" and "£500" count as two.
 */
function countPricingSignals(html) {
  const text = stripScripts(html);
  const matches = text.match(/£\s*\d[\d,]*(?:\.\d+)?/g);
  if (!matches) return 0;
  const distinct = new Set(matches.map((m) => m.replace(/\s+/g, '')));
  return distinct.size;
}

/**
 * Does the site publish pricing? Passes if the home page OR any linked
 * /pricing | /fees | /costs | /plans | /prices page carries at least
 * PRICING_MIN_SIGNALS distinct "£ + number" combinations on that single page.
 *
 * Only pages reachable via an anchor on the home page are fetched — no
 * speculative probing. Never throws.
 */
export async function checkPricing(origin, homeHtml) {
  try {
    if (countPricingSignals(homeHtml) >= PRICING_MIN_SIGNALS) return true;

    const linkedPricingPaths = new Set();
    for (const href of extractHrefs(homeHtml || '')) {
      const p = resolveSameOriginPath(href, origin);
      if (!p) continue;
      for (const base of PRICING_PATHS) {
        if (p === base || p.startsWith(`${base}/`)) {
          linkedPricingPaths.add(p);
          break;
        }
      }
    }

    for (const path of linkedPricingPaths) {
      const html = await fetchSubpageHtml(`${origin}${path}`);
      if (countPricingSignals(html) >= PRICING_MIN_SIGNALS) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Does the site have detailed service pages? Passes if the home page links
 * to at least 2 distinct sub-pages under /services/*, /practice-areas/*,
 * /what-we-do/*, or /expertise/*, AND at least 2 of those fetched sub-pages
 * carry >= SERVICE_MIN_WORDS of visible text. Index pages (e.g. /services)
 * without a sub-path segment do not count. Never throws.
 */
export async function checkDetailedServices(origin, homeHtml) {
  try {
    const candidates = new Set();
    for (const href of extractHrefs(homeHtml || '')) {
      const p = resolveSameOriginPath(href, origin);
      if (!p) continue;
      for (const prefix of SERVICE_PATH_PREFIXES) {
        if (p.startsWith(`${prefix}/`) && p.length > prefix.length + 1) {
          candidates.add(p);
          break;
        }
      }
    }
    if (candidates.size < 2) return false;

    let deepPages = 0;
    const toCheck = [...candidates].slice(0, SERVICE_MAX_PROBES);
    for (const path of toCheck) {
      const html = await fetchSubpageHtml(`${origin}${path}`);
      if (countWords(html) >= SERVICE_MIN_WORDS) {
        deepPages += 1;
        if (deepPages >= 2) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Analyse a webpage for AEO (Answer Engine Optimisation) signals.
 * Returns 10 checks, each scored 0-10, totalling 0-100.
 */
export function analyseAeoSignals(html, url) {
  const checks = [];
  const recommendations = [];

  // 1. Schema.org structured data
  const ldJsonMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const schemaCount = ldJsonMatches.length;
  const jsonLdPayloads = parseJsonLdPayloads(ldJsonMatches);
  const schemaScore = schemaCount >= 3 ? 10 : schemaCount === 2 ? 8 : schemaCount === 1 ? 5 : 0;
  checks.push({
    name: 'Schema.org Structured Data',
    key: 'schema',
    score: schemaScore,
    maxScore: 10,
    passed: schemaScore >= 5,
    details: schemaCount > 0 ? `Found ${schemaCount} JSON-LD schema block(s)` : 'No JSON-LD structured data found',
    recommendation: schemaScore < 5 ? 'Add JSON-LD structured data (Organization, LocalBusiness, Product) so AI models can parse your business details.' : '',
  });
  if (schemaScore < 5) recommendations.push('Add JSON-LD structured data (Organization, LocalBusiness, Product schemas).');

  // 2. Meta title & description
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim() : '';
  const titleOk = title.length >= 20 && title.length <= 70;
  const descOk = description.length >= 50 && description.length <= 160;
  const metaScore = (titleOk ? 5 : title.length > 0 ? 2 : 0) + (descOk ? 5 : description.length > 0 ? 2 : 0);
  checks.push({
    name: 'Meta Title & Description',
    key: 'meta',
    score: metaScore,
    maxScore: 10,
    passed: metaScore >= 7,
    details: `Title: ${title.length} chars${titleOk ? ' (good)' : ''}, Description: ${description.length} chars${descOk ? ' (good)' : ''}`,
    recommendation: metaScore < 7 ? 'Optimise your meta title (20-70 chars) and description (50-160 chars) with clear business keywords.' : '',
  });
  if (metaScore < 7) recommendations.push('Improve meta title (20-70 chars) and description (50-160 chars).');

  // 3. H1 heading
  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1Count = h1Matches.length;
  const h1Score = h1Count === 1 ? 10 : h1Count > 1 ? 6 : 0;
  checks.push({
    name: 'H1 Heading',
    key: 'h1',
    score: h1Score,
    maxScore: 10,
    passed: h1Score >= 6,
    details: h1Count === 1 ? 'Single H1 found (ideal)' : h1Count > 1 ? `${h1Count} H1 tags found (should be 1)` : 'No H1 heading found',
    recommendation: h1Score < 6 ? 'Add a single, descriptive H1 heading that clearly states what your business does.' : '',
  });
  if (h1Score < 6) recommendations.push('Add a clear H1 heading describing your business.');

  // 4. Mobile viewport meta tag
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  const viewportScore = hasViewport ? 10 : 0;
  checks.push({
    name: 'Mobile Viewport',
    key: 'viewport',
    score: viewportScore,
    maxScore: 10,
    passed: hasViewport,
    details: hasViewport ? 'Viewport meta tag present' : 'No viewport meta tag found',
    recommendation: !hasViewport ? 'Add a viewport meta tag for mobile-friendly rendering.' : '',
  });
  if (!hasViewport) recommendations.push('Add <meta name="viewport" content="width=device-width, initial-scale=1">.');

  // 5. SSL (https)
  const isHttps = url.startsWith('https://');
  const sslScore = isHttps ? 10 : 0;
  checks.push({
    name: 'SSL Certificate (HTTPS)',
    key: 'ssl',
    score: sslScore,
    maxScore: 10,
    passed: isHttps,
    details: isHttps ? 'Site uses HTTPS' : 'Site does not use HTTPS',
    recommendation: !isHttps ? 'Switch to HTTPS — AI models and search engines heavily penalise insecure sites.' : '',
  });
  if (!isHttps) recommendations.push('Enable HTTPS on your website.');

  // 6. Page load speed (estimated from HTML size — true speed requires browser)
  const htmlSize = Buffer.byteLength(html, 'utf8');
  const sizeKb = Math.round(htmlSize / 1024);
  const speedScore = sizeKb < 100 ? 10 : sizeKb < 200 ? 8 : sizeKb < 500 ? 5 : sizeKb < 1000 ? 3 : 1;
  checks.push({
    name: 'Page Weight',
    key: 'speed',
    score: speedScore,
    maxScore: 10,
    passed: speedScore >= 5,
    details: `HTML size: ${sizeKb}KB${speedScore >= 8 ? ' (lightweight)' : speedScore >= 5 ? ' (acceptable)' : ' (heavy)'}`,
    recommendation: speedScore < 5 ? 'Reduce HTML page size — heavy pages load slowly and score worse with AI crawlers.' : '',
  });
  if (speedScore < 5) recommendations.push('Reduce page weight for faster loading.');

  // 7. Social media links
  const socialPatterns = [
    { name: 'Facebook', pattern: /facebook\.com\//i },
    { name: 'Twitter/X', pattern: /(?:twitter|x)\.com\//i },
    { name: 'LinkedIn', pattern: /linkedin\.com\//i },
    { name: 'Instagram', pattern: /instagram\.com\//i },
    { name: 'YouTube', pattern: /youtube\.com\//i },
  ];
  const foundSocials = socialPatterns.filter(s => s.pattern.test(html)).map(s => s.name);
  const socialScore = foundSocials.length >= 4 ? 10 : foundSocials.length >= 3 ? 8 : foundSocials.length >= 2 ? 5 : foundSocials.length === 1 ? 3 : 0;
  checks.push({
    name: 'Social Media Links',
    key: 'social',
    score: socialScore,
    maxScore: 10,
    passed: socialScore >= 5,
    details: foundSocials.length > 0 ? `Found: ${foundSocials.join(', ')}` : 'No social media links detected',
    recommendation: socialScore < 5 ? 'Add links to your social media profiles — AI models cross-reference multiple sources.' : '',
  });
  if (socialScore < 5) recommendations.push('Add social media profile links to your website.');

  // 8. Contact information
  const hasPhone = /(?:tel:|phone|call\s*us|[\+]?[\d\s\-()]{10,})/i.test(html);
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(html);
  const hasAddress = /(?:address|street|postcode|zip|road|avenue|lane|drive|court)/i.test(html);
  const contactCount = [hasPhone, hasEmail, hasAddress].filter(Boolean).length;
  const contactScore = contactCount === 3 ? 10 : contactCount === 2 ? 7 : contactCount === 1 ? 4 : 0;
  checks.push({
    name: 'Contact Information',
    key: 'contact',
    score: contactScore,
    maxScore: 10,
    passed: contactScore >= 7,
    details: `Phone: ${hasPhone ? 'yes' : 'no'}, Email: ${hasEmail ? 'yes' : 'no'}, Address: ${hasAddress ? 'yes' : 'no'}`,
    recommendation: contactScore < 7 ? 'Display phone, email, and address prominently — AI uses these to verify your business is real.' : '',
  });
  if (contactScore < 7) recommendations.push('Show your phone number, email, and physical address on the page.');

  // 9. FAQ section or FAQPage schema
  const hasFaqSchema = /FAQPage/i.test(html);
  const hasFaqSection = /<(section|div)[^>]*(?:class|id)=["'][^"']*faq[^"']*["']/i.test(html)
    || /<h[1-6][^>]*>.*?(?:FAQ|frequently\s+asked\s+questions)/i.test(html);
  const faqScore = hasFaqSchema ? 10 : hasFaqSection ? 6 : 0;
  checks.push({
    name: 'FAQ Section',
    key: 'faq',
    score: faqScore,
    maxScore: 10,
    passed: faqScore >= 6,
    details: hasFaqSchema ? 'FAQPage schema detected' : hasFaqSection ? 'FAQ section found (add FAQPage schema for full marks)' : 'No FAQ section or FAQPage schema found',
    recommendation: faqScore < 6 ? 'Add an FAQ section with FAQPage schema — AI assistants directly pull answers from FAQs.' : '',
  });
  if (faqScore < 6) recommendations.push('Add an FAQ section with FAQPage structured data.');

  // 10. Content length
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = textContent.split(/\s+/).length;
  const contentScore = wordCount >= 1000 ? 10 : wordCount >= 500 ? 8 : wordCount >= 300 ? 5 : wordCount >= 100 ? 3 : 1;
  checks.push({
    name: 'Content Length',
    key: 'content',
    score: contentScore,
    maxScore: 10,
    passed: contentScore >= 5,
    details: `Approximately ${wordCount} words${contentScore >= 8 ? ' (good depth)' : contentScore >= 5 ? ' (acceptable)' : ' (thin content)'}`,
    recommendation: contentScore < 5 ? 'Add more written content (500+ words) so AI models have enough context to understand your offering.' : '',
  });
  if (contentScore < 5) recommendations.push('Write more page content (aim for 500+ words).');

  const overallScore = checks.reduce((sum, c) => sum + c.score, 0);

  // Detect TendorAI schema — scan JSON-LD blocks for tendorai.com and check for script tag
  let tendoraiSchemaDetected = false;
  for (const match of ldJsonMatches) {
    if (/tendorai\.com/i.test(match)) {
      tendoraiSchemaDetected = true;
      break;
    }
  }
  if (!tendoraiSchemaDetected) {
    tendoraiSchemaDetected = /api\.tendorai\.com\/api\/schema\//i.test(html) ||
      /src=["'][^"']*tendorai\.com[^"']*schema/i.test(html);
  }

  return { overallScore, checks, recommendations, tendoraiSchemaDetected, jsonLdPayloads };
}

/**
 * Parse raw <script type="application/ld+json"> blocks into plain objects.
 * Tolerant: malformed blocks are skipped. @graph arrays are flattened so
 * each top-level entity appears as its own payload. Always returns an array.
 */
export function parseJsonLdPayloads(ldJsonMatches) {
  const out = [];
  for (const block of ldJsonMatches || []) {
    const inner = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    if (!inner) continue;
    let parsed;
    try {
      parsed = JSON.parse(inner);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (item && typeof item === 'object') {
        if (Array.isArray(item['@graph'])) {
          for (const sub of item['@graph']) {
            if (sub && typeof sub === 'object') out.push(sub);
          }
        } else {
          out.push(item);
        }
      }
    }
  }
  return out;
}

/**
 * Fetch the target URL, run blog detection + AEO signal analysis, and return the combined result.
 * Single entry-point for consumers that want a full site detector pass (home-page fetch + checks).
 *
 * On fetch failure returns { fetchError } and does not attempt analysis.
 * On success returns { websiteUrl, overallScore, checks, recommendations, blogDetection, tendoraiSchemaDetected }.
 */
export async function runDetector({ websiteUrl }) {
  let url = typeof websiteUrl === 'string' ? websiteUrl.trim() : '';
  if (!url) {
    return { fetchError: 'websiteUrl is required' };
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    new URL(url);
  } catch {
    return { fetchError: 'Invalid URL format' };
  }

  let html;
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'TendorAI-AEO-Audit/1.0',
        'Accept': 'text/html',
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
    });
    html = response.data;
  } catch (fetchError) {
    const msg = fetchError.code === 'ECONNABORTED'
      ? 'Website took too long to respond (15s timeout).'
      : fetchError.response
        ? `Website returned HTTP ${fetchError.response.status}.`
        : 'Could not reach the website. Check the URL and try again.';
    return { fetchError: msg };
  }

  if (typeof html !== 'string') {
    return { fetchError: 'Website did not return HTML content.' };
  }

  const origin = new URL(url).origin;
  const blogDetection = await detectBlog(origin, html);
  const hasPricing = await checkPricing(origin, html);
  const hasDetailedServices = await checkDetailedServices(origin, html);
  const { overallScore, checks, recommendations, tendoraiSchemaDetected, jsonLdPayloads } = analyseAeoSignals(html, url);

  return {
    websiteUrl: url,
    overallScore,
    checks,
    recommendations,
    blogDetection,
    hasPricing,
    hasDetailedServices,
    tendoraiSchemaDetected,
    jsonLdPayloads,
  };
}
