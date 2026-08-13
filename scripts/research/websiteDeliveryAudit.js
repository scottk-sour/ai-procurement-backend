#!/usr/bin/env node
/**
 * websiteDeliveryAudit.js — LOCAL RESEARCH SCRIPT (run by hand, never deployed)
 * =============================================================================
 *
 * Question it helps answer: can UK solicitor firms realistically give TendorAI a
 * route to implement changes on their website (→ is a £999/mo managed service
 * deliverable at scale)?
 *
 * READ-ONLY against MongoDB (find/countDocuments only — no writes). NOT wired to
 * any route, cron, or deployed service. Do not import this from the app.
 *
 * Pipeline:
 *   0. Report the four population counts (solicitor / sra / intersection / +website).
 *   1. Fill-rate check on size fields; choose a stratifier honestly.
 *   2. Stratified sample of 100 firms (seeded, reproducible). Report the split.
 *   3. Fetch homepage + one practice-area page + one blog/news index (polite,
 *      sequential, robots-respecting, 10s timeout, one retry).
 *   4. Detect CMS / blog / structured data / agency credit / managed-platform signal.
 *   5. Classify GREEN / AMBER / RED and write one CSV row per firm.
 *   6. Print the chat-report summary to stdout.
 *
 * WEAK-PROXY WARNING (printed again at the end): `agency_credit` and
 * `managed_platform_signal` are weak proxies. A footer credit shows a site was
 * BUILT by someone, NOT that they still hold CMS access. The access question can
 * only be settled by asking firms directly. Nothing here proves who controls a CMS.
 *
 * Usage (run locally, with a .env holding MONGODB_URI and open outbound HTTPS):
 *   node scripts/research/websiteDeliveryAudit.js --sample-only      # phase 1-2 only
 *   node scripts/research/websiteDeliveryAudit.js                    # full run
 * Options:
 *   --limit <n>       sample size (default 100)
 *   --seed <n>        PRNG seed for reproducible sampling (default 20260811)
 *   --delay <ms>      delay between firms (default 3000)
 *   --out <path>      CSV output path (default research-output/website-delivery-audit.csv)
 *   --sample-only     stop after writing the selected sample (no fetching)
 *   --size-threshold <0..1>  min fill rate for a size field to be usable (default 0.4)
 *
 * Requires Node 18+ (global fetch/AbortController). Written for Node 22.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Vendor from '../../models/Vendor.js';

// ─────────────────────────── args ───────────────────────────
function arg(flag, def = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : def;
}
const hasFlag = (flag) => process.argv.includes(flag);

const LIMIT = parseInt(arg('--limit', '100'), 10);
const SEED = parseInt(arg('--seed', '20260811'), 10);
const DELAY_MS = parseInt(arg('--delay', '3000'), 10);
const SIZE_THRESHOLD = parseFloat(arg('--size-threshold', '0.4'));
const OUT = arg('--out', 'research-output/website-delivery-audit.csv');
const SAMPLE_ONLY = hasFlag('--sample-only');

const USER_AGENT =
  'TendorAI-Research/1.0 (+website delivery research; contact scott.davies@tendorai.com)';
const UA_TOKEN = 'tendorai-research'; // for robots User-agent matching
const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const NOW = new Date();

// Population filter: non-empty STRING (excludes missing and null; $nin would wrongly
// include missing fields, so use $type+$ne).
const NON_EMPTY_STR = { $type: 'string', $ne: '' };
const POP_FILTER = {
  vendorType: 'solicitor',
  sraNumber: NON_EMPTY_STR,
  'contactInfo.website': NON_EMPTY_STR,
};

// ─────────────────────── seeded PRNG ───────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────── CSV helpers ───────────────────────
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvRow(cells) { return cells.map(csvCell).join(','); }

// ─────────────────── robots.txt (minimal, honest) ───────────────────
function parseRobots(txt) {
  // groups: [{ agents:[...], rules:[{allow, path}] }]
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase().trim();
    const val = m[2].trim();
    if (field === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'allow' || field === 'disallow') {
      if (!cur) { cur = { agents: ['*'], rules: [] }; groups.push(cur); }
      cur.rules.push({ allow: field === 'allow', path: val });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}
function chooseRobotsGroup(groups) {
  // Prefer a specific group matching our token, else '*'.
  let specific = null, star = null;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === '*') star = star || g;
      else if (UA_TOKEN.includes(a) || a.includes('tendorai')) specific = specific || g;
    }
  }
  return specific || star || null;
}
function robotsAllows(group, urlPath) {
  if (!group) return true;
  // Longest-match; Allow wins ties. Empty Disallow => allow all.
  let best = { len: -1, allow: true };
  for (const r of group.rules) {
    if (r.path === '') { if (!r.allow) continue; else { if (0 > best.len) best = { len: 0, allow: true }; continue; } }
    if (urlPath.startsWith(r.path)) {
      if (r.path.length > best.len || (r.path.length === best.len && r.allow)) {
        best = { len: r.path.length, allow: r.allow };
      }
    }
  }
  return best.allow;
}
async function getRobotsChecker(origin) {
  // Returns { allows(path) -> bool, fetched: bool }. Fail-open if robots absent/unreachable.
  try {
    const res = await fetchOnce(origin + '/robots.txt');
    if (!res.ok || typeof res.html !== 'string' || res.html.length === 0) {
      return { allows: () => true, fetched: false };
    }
    // A robots.txt that is actually HTML (soft-404) => treat as no rules.
    if (/^\s*</.test(res.html)) return { allows: () => true, fetched: false };
    const group = chooseRobotsGroup(parseRobots(res.html));
    return { allows: (p) => robotsAllows(group, p), fetched: true };
  } catch {
    return { allows: () => true, fetched: false };
  }
}

// ─────────────────────── fetch (timeout + 1 retry) ───────────────────────
async function fetchOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    let html = '';
    const reader = res.body?.getReader?.();
    if (reader) {
      let received = 0; const chunks = []; const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        chunks.push(dec.decode(value, { stream: true }));
        if (received > MAX_HTML_BYTES) { try { await reader.cancel(); } catch {} break; }
      }
      html = chunks.join('');
    } else {
      html = await res.text();
    }
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, headers: res.headers, html };
  } finally {
    clearTimeout(timer);
  }
}
async function fetchUrl(url) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { return await fetchOnce(url); }
    catch (e) { lastErr = e; }
  }
  return { error: lastErr ? (lastErr.name === 'AbortError' ? 'timeout' : lastErr.message) : 'unknown' };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────── HTML helpers ───────────────────────
function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try { href = new URL(href, baseUrl).toString(); } catch { continue; }
    links.push({ href, text });
  }
  return links;
}
function sameHost(a, b) { try { return new URL(a).host === new URL(b).host; } catch { return false; } }
function pathOf(u) { try { return new URL(u).pathname || '/'; } catch { return '/'; } }

const PRACTICE_TERMS = /(conveyanc|residential property|family law|divorce|child (?:custody|arrangements)|wills?|probate|estate planning|litigation|dispute resolution|employment law|personal injury|clinical negligence|medical negligence|immigration|commercial (?:law|property)|criminal (?:law|defence)|landlord|tenant|settlement agreement|tribunal)/i;
const PRACTICE_PATHS = /\/(services|practice-areas?|what-we-do|expertise|our-services|sectors|legal-services|areas-of-(?:law|practice)|how-we-(?:can-)?help)(\/|$)/i;
const BLOG_HINT = /(blog|news|insights?|articles?|updates?|press|knowledge[- ]?(?:hub|base)|media[- ]?centre|latest)/i;

// ─────────────────────── detection ───────────────────────
function detectGeneratorMeta(html) {
  const m = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i);
  return m ? m[1] : null;
}
// Each fingerprint: name, builder flag, regexes over html, header checks. Confidence per hit.
const CMS_FINGERPRINTS = [
  { cms: 'WordPress', builder: false, high: [/\/wp-content\//i, /\/wp-includes\//i], med: [/\/wp-json/i, /name=["']generator["'][^>]*WordPress/i] },
  { cms: 'Wix', builder: true, high: [/static\.wixstatic\.com/i, /wix\.com\/website-builder/i], med: [/X-Wix-/i, /\bwix\.com\b/i] },
  { cms: 'Squarespace', builder: true, high: [/static1\.squarespace\.com/i, /Static\.SQUARESPACE_CONTEXT/i], med: [/\bsquarespace\.com\b/i] },
  { cms: 'Webflow', builder: true, high: [/assets\.website-files\.com/i, /\.webflow\.io/i], med: [/data-wf-page/i, /\bwebflow\b/i] },
  { cms: 'Drupal', builder: false, high: [/Drupal\.settings/i, /\/sites\/default\/files\//i], med: [/\/sites\/all\/(?:modules|themes)\//i] },
  { cms: 'Joomla', builder: false, high: [/\/media\/jui\//i], med: [/\/templates\/[a-z0-9_-]+\/(?:css|js)\//i, /com_content/i, /\/media\/system\/js\//i] },
];

// Known UK legal-sector website / managed-marketing platforms. HEURISTIC and editable.
// Detection only fires on LITERAL string presence in source, and is always reported
// with the matched string + Low confidence. Extend as you learn real fingerprints.
const MANAGED_LEGAL_PLATFORMS = [
  { name: 'Conscious Solutions', patterns: [/conscious\.co\.uk/i, /consciousweb/i, /Conscious Solutions/i] },
  { name: 'mmadigital', patterns: [/mmadigital/i, /mma-digital/i] },
  { name: 'Roobix', patterns: [/roobix/i] },
  { name: 'Adtrak', patterns: [/adtrak\.co\.uk/i, /Adtrak/i] },
  { name: 'The Typeface Group', patterns: [/typefacegroup/i] },
  { name: 'Fenix Digital', patterns: [/fenixdigital/i] },
];

function detectCms(html, headers) {
  const generator = detectGeneratorMeta(html);
  if (generator) {
    const g = generator.toLowerCase();
    const map = [
      ['wordpress', 'WordPress', false], ['wix', 'Wix', true], ['squarespace', 'Squarespace', true],
      ['webflow', 'Webflow', true], ['drupal', 'Drupal', false], ['joomla', 'Joomla', false],
    ];
    for (const [needle, cms, builder] of map) {
      if (g.includes(needle)) return { cms, builder, confidence: 'High', evidence: `generator meta: "${generator}"` };
    }
  }
  const hdr = (name) => { try { return headers?.get?.(name) || ''; } catch { return ''; } };
  const headerBlob = ['x-generator', 'x-powered-by', 'server', 'x-wix-request-id', 'x-squarespace-region']
    .map((h) => `${h}: ${hdr(h)}`).join('\n');
  for (const fp of CMS_FINGERPRINTS) {
    for (const re of fp.high) {
      const m = html.match(re) || headerBlob.match(re);
      if (m) return { cms: fp.cms, builder: fp.builder, confidence: 'High', evidence: `matched ${re} → "${String(m[0]).slice(0, 80)}"` };
    }
  }
  for (const fp of CMS_FINGERPRINTS) {
    for (const re of fp.med) {
      const m = html.match(re) || headerBlob.match(re);
      if (m) return { cms: fp.cms, builder: fp.builder, confidence: 'Medium', evidence: `matched ${re} → "${String(m[0]).slice(0, 80)}"` };
    }
  }
  if (generator) return { cms: 'unknown', builder: false, confidence: 'Low', evidence: `generator meta present but unmapped: "${generator}"` };
  if (html && html.length > 0) return { cms: 'custom', builder: false, confidence: 'Low', evidence: 'no known CMS fingerprint; no generator meta tag' };
  return { cms: 'unknown', builder: false, confidence: 'Low', evidence: 'no HTML retrieved' };
}

function detectManagedPlatform(html) {
  for (const p of MANAGED_LEGAL_PLATFORMS) {
    for (const re of p.patterns) {
      const m = html.match(re);
      if (m) return { name: p.name, evidence: `matched ${re} → "${String(m[0]).slice(0, 80)}"`, confidence: 'Low' };
    }
  }
  return { name: '', evidence: '', confidence: 'Low' };
}

function detectAgencyCredit(html) {
  // Look near the end of the document (footer-ish) for build credits. Verbatim capture.
  const tail = html.slice(-8000);
  const re = /((?:site|website|web ?design|web ?development|built|designed|developed|powered)\s+(?:by|&\s*built\s+by)\s+[^<>\n]{2,80})/i;
  const m = tail.match(re) || html.match(re);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  return '';
}

function detectStructuredData(html) {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  if (blocks.length === 0) return { has: 'no', types: '' };
  const types = new Set();
  let invalid = false;
  for (const b of blocks) {
    const inner = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    try {
      const parsed = JSON.parse(inner);
      const collect = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(collect);
        if (node['@graph']) collect(node['@graph']);
        const t = node['@type'];
        if (Array.isArray(t)) t.forEach((x) => types.add(String(x)));
        else if (t) types.add(String(t));
      };
      collect(parsed);
    } catch { invalid = true; }
  }
  const typeList = [...types].join('; ');
  if (types.size === 0) return { has: 'yes', types: invalid ? 'present-but-unparseable' : 'no @type found' };
  return { has: 'yes', types: typeList };
}

// Date parsing for blog last-content-date.
const MONTHS = { jan:0, january:0, feb:1, february:1, mar:2, march:2, apr:3, april:3, may:4, jun:5, june:5, jul:6, july:6, aug:7, august:7, sep:8, sept:8, september:8, oct:9, october:9, nov:10, november:10, dec:11, december:11 };
function extractDates(html) {
  const dates = [];
  const push = (d) => { if (d && !isNaN(d) && d.getFullYear() >= 2000 && d <= new Date(NOW.getTime() + 86400000)) dates.push(d); };
  let m;
  const reTime = /<time[^>]+datetime=["']([^"']+)["']/gi;
  while ((m = reTime.exec(html)) !== null) push(new Date(m[1]));
  const reIso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((m = reIso.exec(html)) !== null) push(new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`));
  const reDMY = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/g;
  while ((m = reDMY.exec(html)) !== null) { const mo = MONTHS[m[2].toLowerCase()]; if (mo !== undefined) push(new Date(Date.UTC(+m[3], mo, +m[1]))); }
  const reMDY = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g;
  while ((m = reMDY.exec(html)) !== null) { const mo = MONTHS[m[1].toLowerCase()]; if (mo !== undefined) push(new Date(Date.UTC(+m[3], mo, +m[2]))); }
  return dates;
}
function estimatePostCount(html) {
  const counts = [];
  const articleTags = (html.match(/<article\b/gi) || []).length;
  if (articleTags > 0) counts.push(articleTags);
  const permas = new Set((html.match(/\/20\d{2}\/\d{2}\/[a-z0-9-]+/gi) || []).map((s) => s.toLowerCase()));
  if (permas.size > 0) counts.push(permas.size);
  const slugLinks = new Set((html.match(/href=["'][^"']*\/(?:blog|news|insights?|articles?)\/[a-z0-9][a-z0-9-]{3,}["']/gi) || []).map((s) => s.toLowerCase()));
  if (slugLinks.size > 0) counts.push(slugLinks.size);
  return counts.length ? Math.max(...counts) : 0;
}

// ─────────────────────── classification ───────────────────────
function classify({ fetchStatus, cms, builder, agencyCredit, managedPlatform, hasBlog }) {
  if (fetchStatus === 'SKIPPED-ROBOTS') return { cls: 'SKIPPED-ROBOTS', conf: 'High', evidence: 'robots.txt disallowed homepage for our agent' };
  if (fetchStatus === 'FAILED') return { cls: 'FAILED', conf: 'High', evidence: 'homepage could not be fetched' };
  if (managedPlatform) return { cls: 'RED', conf: 'Low', evidence: `managed-platform signal: ${managedPlatform} (weak proxy)` };
  const SELF_HOSTABLE = ['WordPress', 'Drupal', 'Joomla'];
  const BUILDERS = ['Wix', 'Squarespace', 'Webflow'];
  if (BUILDERS.includes(cms)) return { cls: 'AMBER', conf: 'Medium', evidence: `hosted builder (${cms}); account can usually be shared` };
  if (SELF_HOSTABLE.includes(cms)) {
    if (agencyCredit) return { cls: 'AMBER', conf: 'Medium', evidence: `${cms} with agency credit "${agencyCredit}" — credit ≠ proof of control; verify` };
    return { cls: 'GREEN', conf: 'Medium', evidence: `${cms}, self-hostable, no managed-platform signal; named editor account is routine` };
  }
  // cms unknown/custom
  if (!hasBlog) return { cls: 'RED', conf: 'Low', evidence: `no CMS detected (${cms}) and no blog/news section` };
  return { cls: 'AMBER', conf: 'Low', evidence: `CMS not identified (${cms}) but content section exists — thin evidence, defaulting AMBER not GREEN/RED` };
}

// ─────────────────────── size stratifier selection ───────────────────────
function computeFillRates(pop) {
  const n = pop.length || 1;
  const numEmp = pop.filter((d) => typeof d.businessProfile?.numEmployees === 'number' && d.businessProfile.numEmployees > 0).length;
  const office = pop.filter((d) => typeof d.officeCount === 'number' && d.officeCount > 0).length;
  const solrs = pop.filter((d) => Array.isArray(d.individualSolicitors) && d.individualSolicitors.length > 0).length;
  const sizeDist = {};
  for (const d of pop) { const v = d.businessProfile?.companySize || '(empty)'; sizeDist[v] = (sizeDist[v] || 0) + 1; }
  const csNonEmpty = pop.filter((d) => d.businessProfile?.companySize && d.businessProfile.companySize !== '').length;
  return {
    numEmployees: { fill: numEmp / n, distinctUseful: new Set(pop.map((d) => empBucket(d)).filter(Boolean)).size },
    companySize: { fill: csNonEmpty / n, distinctUseful: Object.keys(sizeDist).filter((k) => k !== '(empty)').length, dist: sizeDist },
    officeCount: { fill: office / n, distinctUseful: new Set(pop.map((d) => officeBucket(d)).filter(Boolean)).size },
    individualSolicitors: { fill: solrs / n, distinctUseful: new Set(pop.map((d) => solicitorBucket(d)).filter(Boolean)).size },
  };
}
function empBucket(d) { const v = d.businessProfile?.numEmployees; if (!(typeof v === 'number' && v > 0)) return null; if (v <= 5) return '1-5'; if (v <= 20) return '6-20'; if (v <= 50) return '21-50'; return '51+'; }
function officeBucket(d) { const v = d.officeCount; if (!(typeof v === 'number' && v > 0)) return null; if (v === 1) return '1 office'; if (v <= 5) return '2-5 offices'; return '6+ offices'; }
function solicitorBucket(d) { const v = Array.isArray(d.individualSolicitors) ? d.individualSolicitors.length : 0; if (v <= 0) return null; if (v <= 2) return '1-2'; if (v <= 10) return '3-10'; return '11+'; }
function companySizeBucket(d) { const v = d.businessProfile?.companySize; return v && v !== '' ? v : null; }

// ─────────────────────── proportional allocation (largest remainder + capacity) ───────────────────────
function allocate(strata, total) {
  // strata: [{ key, size }]. Returns Map key->count, capped by size, summing to min(total, Σsize).
  const totalSize = strata.reduce((s, x) => s + x.size, 0);
  const target = Math.min(total, totalSize);
  const alloc = new Map();
  const raw = strata.map((s) => ({ key: s.key, size: s.size, ideal: (s.size / totalSize) * target }));
  raw.forEach((r) => alloc.set(r.key, Math.min(r.size, Math.floor(r.ideal))));
  let assigned = [...alloc.values()].reduce((a, b) => a + b, 0);
  // distribute remainder by largest fractional part, respecting capacity
  const order = raw
    .map((r) => ({ key: r.key, size: r.size, frac: r.ideal - Math.floor(r.ideal) }))
    .sort((a, b) => b.frac - a.frac);
  let i = 0, guard = 0;
  while (assigned < target && guard++ < 100000) {
    const r = order[i % order.length];
    if (alloc.get(r.key) < r.size) { alloc.set(r.key, alloc.get(r.key) + 1); assigned++; }
    i++;
    if (i % order.length === 0 && strata.every((s) => alloc.get(s.key) >= s.size)) break;
  }
  return alloc;
}

// ─────────────────────── main ───────────────────────
async function main() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI required in .env'); process.exit(1); }

  await mongoose.connect(MONGO_URI);
  console.log('='.repeat(78));
  console.log('WEBSITE DELIVERY AUDIT — solicitor firms');
  console.log('='.repeat(78));

  // ── Phase 0: population counts ──
  const [cSolicitor, cSra, cIntersect, cIntersectWeb] = await Promise.all([
    Vendor.countDocuments({ vendorType: 'solicitor' }),
    Vendor.countDocuments({ sraNumber: NON_EMPTY_STR }),
    Vendor.countDocuments({ vendorType: 'solicitor', sraNumber: NON_EMPTY_STR }),
    Vendor.countDocuments(POP_FILTER),
  ]);
  console.log('\nPOPULATION COUNTS');
  console.log(`  solicitor (vendorType only) ........ ${cSolicitor}`);
  console.log(`  sraNumber present (any type) ....... ${cSra}`);
  console.log(`  intersection (solicitor + SRA) ..... ${cIntersect}`);
  console.log(`  + non-empty website (SAMPLING POOL). ${cIntersectWeb}`);
  const minSet = Math.min(cSolicitor, cSra);
  if (minSet > 0 && cIntersect < 0.6 * minSet) {
    console.log(`  ⚠ intersection (${cIntersect}) is <60% of the smaller set (${minSet}) — register import is patchier than the headline counts suggest.`);
  }
  if (cIntersectWeb === 0) {
    console.log('\nSTOP: sampling pool is empty. Nothing to sample. Re-check the population definition against the data.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── Load pool ──
  const pool = await Vendor.find(POP_FILTER)
    .select('_id company contactInfo.website sraNumber location.region location.city listingStatus claimed businessProfile.numEmployees businessProfile.companySize officeCount individualSolicitors')
    .lean();

  // ── Phase 1: fill-rate check + stratifier choice ──
  const fill = computeFillRates(pool);
  console.log('\nSIZE-FIELD FILL RATES (over sampling pool)');
  for (const k of ['numEmployees', 'companySize', 'officeCount', 'individualSolicitors']) {
    console.log(`  ${k.padEnd(20)} fill=${(fill[k].fill * 100).toFixed(1)}%  usable-buckets=${fill[k].distinctUseful}`);
  }
  console.log('  companySize distribution:', JSON.stringify(fill.companySize.dist));

  const sizeCandidates = [
    { name: 'numEmployees', bucket: empBucket, ...fill.numEmployees },
    { name: 'officeCount', bucket: officeBucket, ...fill.officeCount },
    { name: 'individualSolicitors', bucket: solicitorBucket, ...fill.individualSolicitors },
    { name: 'companySize', bucket: companySizeBucket, ...fill.companySize },
  ].filter((c) => c.fill >= SIZE_THRESHOLD && c.distinctUseful >= 2)
   .sort((a, b) => b.fill - a.fill);

  const sizeChoice = sizeCandidates[0] || null;
  let stratifierDesc;
  if (sizeChoice) {
    stratifierDesc = `region × ${sizeChoice.name} (size fill ${(sizeChoice.fill * 100).toFixed(1)}% ≥ ${(SIZE_THRESHOLD * 100)}% with ${sizeChoice.distinctUseful} buckets)`;
  } else {
    stratifierDesc = `location.region ONLY (no size field cleared the ${(SIZE_THRESHOLD * 100)}% fill + ≥2-bucket bar — size data effectively absent, so no proxy is used)`;
  }
  console.log(`\nSTRATIFIER CHOSEN: ${stratifierDesc}`);

  // ── Build strata ──
  const stratumKey = (d) => {
    const region = (d.location?.region && d.location.region.trim()) ? d.location.region.trim() : 'UNKNOWN-REGION';
    if (!sizeChoice) return region;
    const b = sizeChoice.bucket(d) || 'UNKNOWN-SIZE';
    return `${region} || ${b}`;
  };
  const byStratum = new Map();
  for (const d of pool) {
    const k = stratumKey(d);
    if (!byStratum.has(k)) byStratum.set(k, []);
    byStratum.get(k).push(d);
  }
  const strata = [...byStratum.entries()].map(([key, docs]) => ({ key, size: docs.length })).sort((a, b) => b.size - a.size);
  const alloc = allocate(strata, LIMIT);

  // ── Sample within strata (seeded) ──
  const rng = mulberry32(SEED);
  const sample = [];
  for (const s of strata) {
    const n = alloc.get(s.key) || 0;
    if (n <= 0) continue;
    const picked = seededShuffle(byStratum.get(s.key), rng).slice(0, n);
    for (const d of picked) sample.push({ ...d, _stratum: s.key });
  }

  console.log(`\nSAMPLE SELECTION (seed=${SEED})`);
  console.log(`  pool=${pool.length}, requested=${LIMIT}, selected=${sample.length}, strata=${strata.length}`);
  if (sample.length < LIMIT) console.log(`  ⚠ pool smaller than requested or capped by stratum sizes — selected ${sample.length}.`);
  console.log('  Per-stratum allocation (non-zero):');
  for (const s of strata) { const n = alloc.get(s.key) || 0; if (n > 0) console.log(`    ${String(n).padStart(3)}  ${s.key}  (of ${s.size})`); }

  const claimedSplit = { unclaimed: 0, claimed: 0, verified: 0, suspended: 0, other: 0 };
  for (const d of sample) { const ls = d.listingStatus || 'other'; if (claimedSplit[ls] === undefined) claimedSplit.other++; else claimedSplit[ls]++; }
  console.log('  Claimed/unclaimed split of sample (listingStatus):', JSON.stringify(claimedSplit));

  // Ensure output dir exists (non-production).
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const HEADER = [
    'vendor_id', 'company', 'website', 'region', 'listing_status', 'stratum',
    'fetch_status', 'http_status', 'final_url',
    'cms', 'cms_confidence', 'cms_evidence',
    'has_blog_or_news', 'blog_url', 'blog_post_count_estimate', 'practice_area_page_count',
    'last_content_date', 'published_last_12mo', 'has_structured_data', 'structured_data_types',
    'agency_credit', 'managed_platform_signal', 'managed_platform_evidence',
    'classification', 'classification_confidence', 'classification_evidence', 'confidence',
    'error',
  ];

  if (SAMPLE_ONLY) {
    const outRows = [csvRow(HEADER)];
    for (const d of sample) {
      outRows.push(csvRow([
        String(d._id), d.company, d.contactInfo?.website, d.location?.region, d.listingStatus, d._stratum,
        'NOT-FETCHED', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      ]));
    }
    fs.writeFileSync(OUT, outRows.join('\n') + '\n');
    console.log(`\n--sample-only: wrote ${sample.length} rows (no fetch) to ${OUT}`);
    console.log('Review the sample, then re-run without --sample-only to fetch + classify.');
    await mongoose.disconnect();
    return;
  }

  // ── Phase 2-4: fetch + detect + classify (sequential, polite) ──
  console.log(`\nFETCHING ${sample.length} firms sequentially (UA="${USER_AGENT}", ${DELAY_MS}ms between firms)...`);
  const rows = [];
  let idx = 0;
  for (const d of sample) {
    idx++;
    const website = d.contactInfo.website;
    let origin;
    try { origin = new URL(website).origin; } catch { origin = null; }
    const rec = {
      vendor_id: String(d._id), company: d.company, website, region: d.location?.region || '',
      listing_status: d.listingStatus || '', stratum: d._stratum,
      fetch_status: '', http_status: '', final_url: '',
      cms: 'UNKNOWN', cms_confidence: 'Low', cms_evidence: '',
      has_blog_or_news: 'no', blog_url: '', blog_post_count_estimate: '', practice_area_page_count: '0',
      last_content_date: 'UNKNOWN', published_last_12mo: 'UNKNOWN', has_structured_data: 'UNKNOWN', structured_data_types: '',
      agency_credit: '', managed_platform_signal: '', managed_platform_evidence: '',
      classification: '', classification_confidence: '', classification_evidence: '', confidence: '', error: '',
    };

    process.stdout.write(`  [${idx}/${sample.length}] ${d.company?.slice(0, 40) || ''} — ${website} ... `);

    if (!origin) {
      rec.fetch_status = 'FAILED'; rec.error = 'unparseable website URL';
      Object.assign(rec, classifyInto(rec, { cms: 'unknown', builder: false, agencyCredit: '', managedPlatform: '', hasBlog: false }));
      rows.push(rec); console.log('FAILED (bad URL)');
      await sleep(DELAY_MS); continue;
    }

    // robots
    const robots = await getRobotsChecker(origin);
    if (!robots.allows(pathOf(website) || '/')) {
      rec.fetch_status = 'SKIPPED-ROBOTS';
      Object.assign(rec, classifyInto(rec, { cms: 'unknown', builder: false, agencyCredit: '', managedPlatform: '', hasBlog: false }));
      rows.push(rec); console.log('SKIPPED-ROBOTS');
      await sleep(DELAY_MS); continue;
    }

    // homepage
    const home = await fetchUrl(website);
    if (home.error || !home.html) {
      rec.fetch_status = 'FAILED'; rec.error = home.error || 'empty response'; rec.http_status = home.status || '';
      Object.assign(rec, classifyInto(rec, { cms: 'unknown', builder: false, agencyCredit: '', managedPlatform: '', hasBlog: false }));
      rows.push(rec); console.log(`FAILED (${rec.error})`);
      await sleep(DELAY_MS); continue;
    }
    rec.fetch_status = 'OK'; rec.http_status = home.status; rec.final_url = home.finalUrl;
    const html = home.html;

    // CMS + managed + agency + structured data (homepage)
    const cmsInfo = detectCms(html, home.headers);
    rec.cms = cmsInfo.cms; rec.cms_confidence = cmsInfo.confidence; rec.cms_evidence = cmsInfo.evidence;
    const managed = detectManagedPlatform(html);
    rec.managed_platform_signal = managed.name; rec.managed_platform_evidence = managed.evidence;
    rec.agency_credit = detectAgencyCredit(html);
    const sd = detectStructuredData(html);
    rec.has_structured_data = sd.has; rec.structured_data_types = sd.types;

    // links → practice pages + blog discovery
    const links = extractLinks(html, home.finalUrl);
    const practiceLinks = [];
    const seenPractice = new Set();
    let blogLink = null;
    for (const l of links) {
      if (!sameHost(l.href, home.finalUrl)) continue;
      const p = pathOf(l.href);
      if (p === '/' ) continue;
      if ((PRACTICE_PATHS.test(p) || PRACTICE_TERMS.test(l.text) || PRACTICE_TERMS.test(p)) && !seenPractice.has(p)) {
        seenPractice.add(p); practiceLinks.push(l.href);
      }
      if (!blogLink && (BLOG_HINT.test(p) || BLOG_HINT.test(l.text))) blogLink = l.href;
    }
    rec.practice_area_page_count = String(seenPractice.size);

    // fetch one practice-area page (strengthens count/CMS; robots-checked)
    if (practiceLinks.length > 0) {
      const pu = practiceLinks[0];
      if (robots.allows(pathOf(pu))) {
        await sleep(Math.min(1500, DELAY_MS));
        const pr = await fetchUrl(pu);
        if (!pr.error && pr.html) {
          const extra = extractLinks(pr.html, pr.finalUrl || pu)
            .filter((l) => sameHost(l.href, home.finalUrl) && pathOf(l.href) !== '/' && (PRACTICE_PATHS.test(pathOf(l.href)) || PRACTICE_TERMS.test(l.text)))
            .map((l) => pathOf(l.href));
          extra.forEach((p) => seenPractice.add(p));
          rec.practice_area_page_count = String(seenPractice.size);
          if (rec.cms === 'custom' || rec.cms === 'unknown') {
            const c2 = detectCms(pr.html, pr.headers);
            if (c2.cms !== 'custom' && c2.cms !== 'unknown') { rec.cms = c2.cms; rec.cms_confidence = c2.confidence; rec.cms_evidence = c2.evidence + ' (practice page)'; }
          }
        }
      }
    }

    // fetch blog/news index
    if (blogLink) {
      if (robots.allows(pathOf(blogLink))) {
        await sleep(Math.min(1500, DELAY_MS));
        const br = await fetchUrl(blogLink);
        if (!br.error && br.html) {
          rec.has_blog_or_news = 'yes'; rec.blog_url = br.finalUrl || blogLink;
          rec.blog_post_count_estimate = String(estimatePostCount(br.html));
          const dates = extractDates(br.html);
          if (dates.length) {
            const latest = new Date(Math.max(...dates.map((x) => x.getTime())));
            rec.last_content_date = latest.toISOString().slice(0, 10);
            rec.published_last_12mo = (NOW - latest) <= 366 * 86400000 ? 'yes' : 'no';
          } else { rec.last_content_date = 'UNKNOWN'; rec.published_last_12mo = 'UNKNOWN'; }
        } else {
          // link existed but index unfetchable — record discovery, not content
          rec.has_blog_or_news = 'yes'; rec.blog_url = blogLink; rec.blog_post_count_estimate = 'UNKNOWN';
        }
      } else {
        rec.has_blog_or_news = 'yes'; rec.blog_url = blogLink + ' (robots-skipped)';
      }
    }

    Object.assign(rec, classifyInto(rec, {
      cms: rec.cms, builder: cmsInfo.builder, agencyCredit: rec.agency_credit,
      managedPlatform: rec.managed_platform_signal, hasBlog: rec.has_blog_or_news === 'yes',
    }));
    rows.push(rec);
    console.log(`OK — ${rec.cms} → ${rec.classification}`);
    await sleep(DELAY_MS);
  }

  // ── Phase 5: write CSV ──
  const outLines = [csvRow(HEADER)];
  for (const r of rows) outLines.push(csvRow(HEADER.map((h) => r[h])));
  fs.writeFileSync(OUT, outLines.join('\n') + '\n');
  console.log(`\nWrote ${rows.length} rows to ${OUT}`);

  // ── Phase 6: chat-report summary ──
  printSummary(rows, { cSolicitor, cSra, cIntersect, cIntersectWeb }, stratifierDesc, claimedSplit);

  await mongoose.disconnect();
}

function classifyInto(rec, sig) {
  const c = classify({ fetchStatus: rec.fetch_status, ...sig });
  return { classification: c.cls, classification_confidence: c.conf, classification_evidence: c.evidence, confidence: c.conf };
}

function printSummary(rows, counts, stratifierDesc, claimedSplit) {
  const n = rows.length || 1;
  const by = (k) => rows.reduce((a, r) => (a[r[k]] = (a[r[k]] || 0) + 1, a), {});
  const clsDist = by('classification');
  const cmsDist = by('cms');
  const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;
  const blog = rows.filter((r) => r.has_blog_or_news === 'yes').length;
  const pub12 = rows.filter((r) => r.published_last_12mo === 'yes').length;

  const rank = { High: 3, Medium: 2, Low: 1 };
  const leastConfident = rows.slice()
    .sort((a, b) => (rank[a.classification_confidence] || 0) - (rank[b.classification_confidence] || 0))
    .slice(0, 10);

  console.log('\n' + '='.repeat(78));
  console.log('SUMMARY (report this in chat)');
  console.log('='.repeat(78));
  console.log(`Population: solicitor=${counts.cSolicitor}, sra=${counts.cSra}, intersection=${counts.cIntersect}, +website=${counts.cIntersectWeb}`);
  console.log(`Stratifier: ${stratifierDesc}`);
  console.log(`Sample claimed/unclaimed: ${JSON.stringify(claimedSplit)}`);
  console.log('\nCLASSIFICATION:');
  for (const k of ['GREEN', 'AMBER', 'RED', 'SKIPPED-ROBOTS', 'FAILED']) console.log(`  ${k.padEnd(15)} ${clsDist[k] || 0}  (${pct(clsDist[k] || 0)})`);
  console.log('\nCMS DISTRIBUTION:');
  for (const [k, v] of Object.entries(cmsDist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${v}  (${pct(v)})`);
  console.log(`\nHas any blog/news section: ${blog}/${n}  (${pct(blog)})`);
  console.log(`Published in last 12 months: ${pub12}/${n}  (${pct(pub12)})  [UNKNOWN dates excluded]`);
  console.log('\n10 LEAST-CONFIDENT CLASSIFICATIONS (check by hand):');
  for (const r of leastConfident) console.log(`  [${r.classification}/${r.classification_confidence}] ${r.company} — ${r.website} — ${r.classification_evidence}`);
  console.log('\nCAVEATS:');
  console.log('  • agency_credit and managed_platform_signal are WEAK proxies. A footer credit');
  console.log('    means a site was BUILT by someone, not that they still hold CMS access.');
  console.log('  • The delivery-route question can only be settled by ASKING firms directly.');
  console.log('  • Sample is only firms with vendorType=solicitor AND sraNumber AND a website —');
  console.log('    firms without a stored website are excluded and may differ systematically.');
  console.log('  • last_content_date parsing is best-effort; UNKNOWN ≠ "no posts".');
  console.log('  • managed-platform list is a small heuristic; absence ≠ not-managed.');
}

main().catch((err) => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });
