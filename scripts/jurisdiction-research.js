import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'proposed-jurisdiction-rows');

const ALLOWED_HOSTS = new Set([
  'legislation.gov.uk',
  'www.legislation.gov.uk',
  'gov.wales',
  'www.gov.wales',
  'gov.uk',
  'www.gov.uk',
  'law.gov.wales',
  'sra.org.uk',
  'www.sra.org.uk',
]);

export function isAllowedUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export async function fetchOfficial(url) {
  if (!isAllowedUrl(url)) throw new Error(`URL not on allow-list: ${url}`);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'TendorAI-JurisdictionResearch/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const html = await resp.text();
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 8000);
}

const FALLBACK_TOPICS = {
  solicitor: [
    'conveyancing', 'residential-property', 'landlord-tenant', 'wills-probate',
    'family', 'employment', 'litigation', 'personal-injury', 'immigration',
    'commercial-property', 'wills-trusts', 'dispute-resolution',
  ],
};

function getTopics(vendorType) {
  try {
    const { PILLAR_LIBRARIES } = await_import_sync();
    const pillars = PILLAR_LIBRARIES[vendorType];
    if (pillars?.length) {
      return pillars.flatMap(p => p.topics.map(t => t.id || t.title));
    }
  } catch { /* fall through */ }
  return FALLBACK_TOPICS[vendorType] || FALLBACK_TOPICS.solicitor;
}

function await_import_sync() {
  throw new Error('use async path');
}

async function getTopicsAsync(vendorType) {
  try {
    const { PILLAR_LIBRARIES } = await import('../services/contentPlanner/pillarLibraries.js');
    const pillars = PILLAR_LIBRARIES[vendorType];
    if (pillars?.length) {
      const ids = pillars.flatMap(p => p.topics.map(t => t.id || t.title)).filter(Boolean);
      if (ids.length > 0) return ids;
    }
  } catch { /* fall through */ }
  return FALLBACK_TOPICS[vendorType] || FALLBACK_TOPICS.solicitor;
}

const SYSTEM_PROMPT = `You are a legal researcher comparing Welsh law to English law for a specific professional topic.

RULES — absolute:
1. Use ONLY the supplied official text extracts. Do NOT rely on prior knowledge.
2. Decide: does Welsh law MATERIALLY differ from English law for this topic?
3. "No divergence" is a valid answer. Do NOT manufacture differences.
4. If diverges:true, provide a verbatim quote (<15 words) from the supplied text + the source URL proving the difference.
5. If diverges:false, provide a verbatim quote showing the law is UK-wide or not devolved.
6. If diverges:true, draft a jurisdictionFacts row (JSON) with this schema:
   { id, domain, appliesTo, england: { canonical }, wales: { canonical }, forbiddenInWales: [], forbiddenInEngland: [], requiredInWales: [], sources: [{ fact, url, quote }], verifyBeforeCommit: [{ fact, url, note }] }
   Any fact not directly quoted from supplied text goes in verifyBeforeCommit, NOT sources.
7. Return JSON only. No markdown fences, no prose.

Return: { "topic": string, "diverges": boolean, "quote": string, "url": string, "row": object|null }`;

async function analyseOneTopic(anthropic, vendorType, topic, sourceTexts) {
  const userContent = `Vendor type: ${vendorType}\nTopic: ${topic}\n\nOfficial source extracts:\n${sourceTexts.map(s => `--- ${s.url} ---\n${s.text.substring(0, 3000)}`).join('\n\n')}`;

  const resp = await anthropic.messages.create({
    model: process.env.ANTHROPIC_SONNET_MODEL || 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const raw = resp.content[0]?.text || '';
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

function writeProposedRow(id, row) {
  const content = `// Proposed jurisdiction row — DO NOT import directly.\n// Copy to lib/config/jurisdictionFacts.js after human verification.\nexport const proposed = ${JSON.stringify(row, null, 2)};\n`;
  const filePath = path.join(OUT_DIR, `${id}.proposed.js`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function writeReport(vendorType, diverging, identical) {
  const lines = [`# Jurisdiction Scan: ${vendorType}`, `Generated: ${new Date().toISOString()}`, ''];

  lines.push('## DIVERGES (proposed rows)', '');
  if (diverging.length === 0) lines.push('_None found._', '');
  for (const d of diverging) {
    lines.push(`### ${d.topic}`);
    lines.push(`- **Quote:** "${d.quote}"`);
    lines.push(`- **URL:** ${d.url}`);
    lines.push(`- **Proposed row:** \`proposed-jurisdiction-rows/${d.rowFile}\``);
    lines.push('');
  }

  lines.push('## IDENTICAL (no row needed)', '');
  if (identical.length === 0) lines.push('_None found._', '');
  for (const i of identical) {
    lines.push(`### ${i.topic}`);
    lines.push(`- **Quote:** "${i.quote}"`);
    lines.push(`- **URL:** ${i.url}`);
    lines.push('');
  }

  const filePath = path.join(OUT_DIR, `${vendorType}-scan.md`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

async function main() {
  const vendorType = process.argv[3] || process.argv[2];
  const command = process.argv[2];

  if (command !== 'scan' || !vendorType) {
    console.error('Usage: node scripts/jurisdiction-research.js scan <vendorType>');
    console.error('Example: node scripts/jurisdiction-research.js scan solicitor');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const topics = await getTopicsAsync(vendorType);
  console.log(`Scanning ${topics.length} topics for ${vendorType}...`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const diverging = [];
  const identical = [];

  const govWalesUrl = 'https://www.gov.wales/housing-law-changed-renting-homes';
  const legislationUrl = 'https://www.legislation.gov.uk/anaw/2016/1';
  const govUkUrl = 'https://www.gov.uk/government/collections/conveyancing';

  for (const topic of topics) {
    console.log(`  → ${topic}`);
    const sourceTexts = [];

    const urls = [
      `https://www.legislation.gov.uk/ukpga?title=${encodeURIComponent(topic)}`,
      `https://www.gov.wales/search?query=${encodeURIComponent(topic + ' law')}`,
    ];

    for (const url of urls) {
      try {
        const text = await fetchOfficial(url);
        sourceTexts.push({ url, text });
      } catch (err) {
        console.log(`    ⚠ Could not fetch ${url}: ${err.message}`);
      }
    }

    if (sourceTexts.length === 0) {
      console.log(`    ⚠ No sources fetched, skipping`);
      identical.push({ topic, quote: 'No official sources fetched', url: 'N/A' });
      continue;
    }

    try {
      const result = await analyseOneTopic(anthropic, vendorType, topic, sourceTexts);

      if (result.diverges && result.row) {
        const rowId = result.row.id || topic.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
        const rowFile = `${rowId}.proposed.js`;
        writeProposedRow(rowId, result.row);
        diverging.push({ topic, quote: result.quote || '', url: result.url || '', rowFile });
        console.log(`    ✓ DIVERGES — proposed row written`);
      } else {
        identical.push({ topic, quote: result.quote || 'No divergence found', url: result.url || 'N/A' });
        console.log(`    ✓ IDENTICAL`);
      }
    } catch (err) {
      console.error(`    ✗ Analysis failed: ${err.message}`);
      identical.push({ topic, quote: `Error: ${err.message}`, url: 'N/A' });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  const reportPath = writeReport(vendorType, diverging, identical);

  console.log('\n=== RESULTS ===');
  console.log(`\nDIVERGES (${diverging.length}):`);
  for (const d of diverging) console.log(`  ${d.topic} → ${d.rowFile}`);
  console.log(`\nIDENTICAL (${identical.length}):`);
  for (const i of identical) console.log(`  ${i.topic}`);
  console.log(`\nReport: ${reportPath}`);
}

export { analyseOneTopic, writeProposedRow, writeReport, getTopicsAsync, SYSTEM_PROMPT };

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch(err => { console.error(err); process.exit(1); });
}
