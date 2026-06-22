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

const LEGAL_SUBJECTS = {
  solicitor: [
    {
      id: 'conveyancing',
      subject: 'Residential conveyancing / property transfer',
      urls: [
        'https://law.gov.wales/land-and-property',
        'https://www.legislation.gov.uk/anaw/2015/7/contents',
        'https://www.gov.uk/buy-sell-your-home',
      ],
    },
    {
      id: 'residential-tenancy',
      subject: 'Residential tenancy / landlord-tenant law',
      urls: [
        'https://www.gov.wales/housing-law-changed-renting-homes',
        'https://www.legislation.gov.uk/anaw/2016/1',
        'https://www.gov.uk/private-renting',
      ],
    },
    {
      id: 'wills-probate',
      subject: 'Wills and probate',
      urls: [
        'https://law.gov.wales/wills-and-probate',
        'https://www.gov.uk/wills-probate-inheritance',
        'https://www.legislation.gov.uk/ukpga/1837/26',
      ],
    },
    {
      id: 'family-law',
      subject: 'Family law / divorce / child custody',
      urls: [
        'https://law.gov.wales/family',
        'https://www.gov.uk/divorce',
        'https://www.legislation.gov.uk/ukpga/1973/18',
      ],
    },
    {
      id: 'employment-law',
      subject: 'Employment law / unfair dismissal / tribunal',
      urls: [
        'https://law.gov.wales/employment',
        'https://www.gov.uk/employment-status',
        'https://www.legislation.gov.uk/ukpga/1996/18',
      ],
    },
    {
      id: 'personal-injury',
      subject: 'Personal injury claims',
      urls: [
        'https://law.gov.wales/personal-injury',
        'https://www.gov.uk/claim-compensation-criminal-injury',
      ],
    },
    {
      id: 'immigration',
      subject: 'Immigration law',
      urls: [
        'https://www.gov.uk/browse/visas-immigration',
        'https://www.legislation.gov.uk/ukpga/2014/22',
      ],
    },
    {
      id: 'commercial-property',
      subject: 'Commercial property / leases',
      urls: [
        'https://law.gov.wales/land-and-property',
        'https://www.gov.uk/renting-business-property-tenant-responsibilities',
      ],
    },
    {
      id: 'dispute-resolution',
      subject: 'Dispute resolution / litigation / court process',
      urls: [
        'https://law.gov.wales/courts-and-tribunals',
        'https://www.gov.uk/court-fees-what-they-are',
      ],
    },
    {
      id: 'property-tax',
      subject: 'Property transaction tax (SDLT vs LTT)',
      urls: [
        'https://www.gov.wales/land-transaction-tax-guide',
        'https://www.gov.uk/stamp-duty-land-tax',
      ],
    },
    {
      id: 'anti-money-laundering',
      subject: 'Anti-money laundering obligations for solicitors',
      urls: [
        'https://www.sra.org.uk/solicitors/guidance/anti-money-laundering/',
        'https://www.legislation.gov.uk/ukpga/2017/22',
      ],
    },
    {
      id: 'client-money-protection',
      subject: 'Client money / solicitor accounts rules',
      urls: [
        'https://www.sra.org.uk/solicitors/guidance/accounts-rules/',
      ],
    },
  ],
};

const SYSTEM_PROMPT = `You are a legal researcher comparing Welsh law to English law for a specific professional topic.

RULES — absolute:
1. Use ONLY the supplied official text extracts. Do NOT rely on prior knowledge.
2. Decide: does Welsh law MATERIALLY differ from English law for this topic?
3. "No divergence" is a valid, expected answer. Do NOT manufacture differences.
4. THREE possible verdicts — pick exactly one:
   - "DIVERGES": Welsh law materially differs. Requires a verbatim quote (<15 words) from the supplied text + the source URL proving the difference.
   - "IDENTICAL": The law is demonstrably UK-wide, reserved, or not devolved. Requires a verbatim quote + URL showing this.
   - "UNKNOWN": The supplied text is insufficient to determine divergence either way. This is the DEFAULT when text is thin, ambiguous, or off-topic.
5. CRITICAL: absence of evidence is UNKNOWN, never IDENTICAL. "0 results" or thin text => UNKNOWN.
6. If verdict is "DIVERGES", draft a jurisdictionFacts row (JSON) with this schema:
   { id, domain, appliesTo, england: { canonical }, wales: { canonical }, forbiddenInWales: [], forbiddenInEngland: [], requiredInWales: [], sources: [{ fact, url, quote }], verifyBeforeCommit: [{ fact, url, note }] }
   Any fact not directly quoted from supplied text goes in verifyBeforeCommit, NOT sources.
7. Return JSON only. No markdown fences, no prose.

Return: { "topic": string, "verdict": "DIVERGES"|"IDENTICAL"|"UNKNOWN", "quote": string|null, "url": string|null, "reason": string, "row": object|null }`;

async function analyseOneTopic(anthropic, vendorType, topic, sourceTexts) {
  const userContent = `Vendor type: ${vendorType}\nLegal subject: ${topic.subject}\n\nOfficial source extracts:\n${sourceTexts.map(s => `--- ${s.url} ---\n${s.text.substring(0, 3000)}`).join('\n\n')}`;

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

export function writeReport(vendorType, diverging, identical, unknown) {
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

  lines.push('## IDENTICAL (confirmed UK-wide / not devolved)', '');
  if (identical.length === 0) lines.push('_None confirmed._', '');
  for (const i of identical) {
    lines.push(`### ${i.topic}`);
    lines.push(`- **Quote:** "${i.quote}"`);
    lines.push(`- **URL:** ${i.url}`);
    lines.push('');
  }

  lines.push('## UNKNOWN (insufficient evidence — needs manual research)', '');
  if (unknown.length === 0) lines.push('_None._', '');
  for (const u of unknown) {
    lines.push(`### ${u.topic}`);
    lines.push(`- **Reason:** ${u.reason}`);
    lines.push('');
  }

  const filePath = path.join(OUT_DIR, `${vendorType}-scan.md`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

function getSubjects(vendorType) {
  return LEGAL_SUBJECTS[vendorType] || LEGAL_SUBJECTS.solicitor;
}

async function main() {
  const command = process.argv[2];
  const vendorType = process.argv[3];

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

  const subjects = getSubjects(vendorType);
  console.log(`Scanning ${subjects.length} legal subjects for ${vendorType}...`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const diverging = [];
  const identical = [];
  const unknown = [];

  for (const topic of subjects) {
    console.log(`  → ${topic.subject}`);
    const sourceTexts = [];

    for (const url of topic.urls) {
      try {
        const text = await fetchOfficial(url);
        const meaningful = text.length > 200 && !/0 results|no results found|page not found/i.test(text.substring(0, 500));
        if (meaningful) {
          sourceTexts.push({ url, text });
        } else {
          console.log(`    ⚠ Thin/empty response from ${url}`);
        }
      } catch (err) {
        console.log(`    ⚠ Could not fetch ${url}: ${err.message}`);
      }
    }

    if (sourceTexts.length === 0) {
      console.log(`    ? UNKNOWN — no usable sources`);
      unknown.push({ topic: topic.subject, reason: 'No usable official sources fetched' });
      continue;
    }

    try {
      const result = await analyseOneTopic(anthropic, vendorType, topic, sourceTexts);
      const verdict = (result.verdict || '').toUpperCase();

      if (verdict === 'DIVERGES' && result.row) {
        const rowId = result.row.id || topic.id;
        const rowFile = `${rowId}.proposed.js`;
        writeProposedRow(rowId, result.row);
        diverging.push({ topic: topic.subject, quote: result.quote || '', url: result.url || '', rowFile });
        console.log(`    ✓ DIVERGES — proposed row written`);
      } else if (verdict === 'IDENTICAL' && result.quote && result.url) {
        identical.push({ topic: topic.subject, quote: result.quote, url: result.url });
        console.log(`    = IDENTICAL — ${result.quote.substring(0, 60)}`);
      } else {
        unknown.push({ topic: topic.subject, reason: result.reason || 'Insufficient evidence from model' });
        console.log(`    ? UNKNOWN — ${(result.reason || '').substring(0, 80)}`);
      }
    } catch (err) {
      console.error(`    ✗ Analysis failed: ${err.message}`);
      unknown.push({ topic: topic.subject, reason: `Analysis error: ${err.message}` });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  const reportPath = writeReport(vendorType, diverging, identical, unknown);

  console.log('\n=== RESULTS ===');
  console.log(`\nDIVERGES (${diverging.length}):`);
  for (const d of diverging) console.log(`  ${d.topic} → ${d.rowFile}`);
  console.log(`\nIDENTICAL (${identical.length}):`);
  for (const i of identical) console.log(`  ${i.topic}`);
  console.log(`\nUNKNOWN (${unknown.length}):`);
  for (const u of unknown) console.log(`  ${u.topic} — ${u.reason}`);
  console.log(`\nReport: ${reportPath}`);
}

export { analyseOneTopic, writeProposedRow, getSubjects, SYSTEM_PROMPT, LEGAL_SUBJECTS };

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch(err => { console.error(err); process.exit(1); });
}
