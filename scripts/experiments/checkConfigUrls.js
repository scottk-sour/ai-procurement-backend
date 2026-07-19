#!/usr/bin/env node

/**
 * Spot-check that target URLs in an experiment config actually resolve.
 * Fetches a random sample (default 5) with HEAD requests and fails loudly
 * if any return 404.
 *
 * Usage:
 *   node scripts/experiments/checkConfigUrls.js --config data/experiments/exp001-config.json [--sample 10]
 */

import fs from 'fs';

const args = process.argv.slice(2);
const configIdx = args.indexOf('--config');
const sampleIdx = args.indexOf('--sample');
if (configIdx === -1) { console.error('Usage: --config <path> [--sample N]'); process.exit(1); }

const configPath = args[configIdx + 1];
const sampleSize = parseInt(args[sampleIdx !== -1 ? sampleIdx + 1 : undefined] || '5');

if (!fs.existsSync(configPath)) { console.error(`Config not found: ${configPath}`); process.exit(1); }
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const allUrls = new Set();
for (const prompt of config.prompts) {
  for (const t of (prompt.targets || [])) {
    allUrls.add(t.url);
  }
}

const urlArray = [...allUrls];
console.log(`Config has ${urlArray.length} unique target URLs`);

// Fisher-Yates sample
for (let i = urlArray.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [urlArray[i], urlArray[j]] = [urlArray[j], urlArray[i]];
}
const sample = urlArray.slice(0, Math.min(sampleSize, urlArray.length));

console.log(`Checking ${sample.length} URLs...\n`);

let failures = 0;

for (const url of sample) {
  try {
    const resp = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const status = resp.status;
    const ok = status >= 200 && status < 400;
    const icon = ok ? 'OK' : 'FAIL';
    console.log(`  ${icon} [${status}] ${url}`);
    if (!ok) failures++;
  } catch (err) {
    console.log(`  FAIL [error] ${url} — ${err.message}`);
    failures++;
  }
}

console.log(`\n${failures === 0 ? 'All URLs resolved successfully.' : `${failures} URL(s) FAILED — check the pattern before running scans.`}`);
if (failures > 0) process.exit(1);
