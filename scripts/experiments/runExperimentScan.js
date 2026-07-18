#!/usr/bin/env node

/**
 * Experiment Scan Runner
 *
 * Runs N=10 clean completions per prompt per platform for a given experiment config.
 * Stores results in the experimentRuns collection (never routine mention data).
 * Idempotent per wave — re-running tops up to 10 clean runs, never duplicates.
 *
 * Usage:
 *   node scripts/experiments/runExperimentScan.js \
 *     --config data/experiments/exp001-config.json \
 *     --wave 1 \
 *     --platforms perplexity,chatgpt,gemini
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const RUNS_PER_PROMPT = 10;
const MAX_RETRIES_FACTOR = 3;
const INTER_CALL_DELAY_MS = 2000;

const PLATFORM_CONFIG = {
  perplexity: {
    envKey: 'PERPLEXITY_API_KEY',
    modelVersion: 'sonar',
    async query(prompt) {
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({ apiKey: process.env.PERPLEXITY_API_KEY, baseURL: 'https://api.perplexity.ai' });
      const resp = await client.chat.completions.create({
        model: 'sonar', messages: [{ role: 'user', content: prompt }], max_tokens: 1024,
      });
      const text = resp.choices?.[0]?.message?.content || '';
      const citations = resp.citations || [];
      return { text, citations, modelVersion: 'sonar' };
    },
  },
  chatgpt: {
    envKey: 'OPENAI_API_KEY',
    modelVersion: 'gpt-4o-mini-search-preview',
    async query(prompt) {
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini-search-preview', messages: [{ role: 'user', content: prompt }], max_tokens: 1024,
      });
      const msg = resp.choices?.[0]?.message;
      const text = msg?.content || '';
      const annotations = msg?.annotations || [];
      const citations = annotations.filter(a => a.url_citation?.url).map(a => a.url_citation.url);
      return { text, citations, modelVersion: 'gpt-4o-mini-search-preview' };
    },
  },
  gemini: {
    envKey: 'GEMINI_API_KEY',
    modelVersion: 'gemini-2.0-flash',
    async query(prompt) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', tools: [{ googleSearch: {} }] });
      const result = await model.generateContent(prompt);
      const text = result.response?.text() || '';
      const grounding = result.response?.candidates?.[0]?.groundingMetadata;
      const chunks = grounding?.groundingChunks || [];
      const citations = chunks.filter(c => c.web?.uri).map(c => c.web.uri);
      return { text, citations, modelVersion: 'gemini-2.0-flash' };
    },
  },
};

function normaliseUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/+$/, '').toLowerCase();
  } catch { return url.toLowerCase().replace(/\/+$/, ''); }
}

function checkTargets(responseText, citedUrls, targets) {
  const normCited = new Set(citedUrls.map(normaliseUrl));
  const lowerText = (responseText || '').toLowerCase();

  return targets.map(t => {
    const normTarget = normaliseUrl(t.url);
    const cited = normCited.has(normTarget) || citedUrls.some(u => normaliseUrl(u).startsWith(normTarget));
    const entityName = t.entityName || '';
    const mentioned = entityName ? lowerText.includes(entityName.toLowerCase()) : false;
    return { url: t.url, group: t.group, cited, mentioned, entityName };
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf('--config');
  const waveIdx = args.indexOf('--wave');
  const platformsIdx = args.indexOf('--platforms');

  if (configIdx === -1 || waveIdx === -1) {
    console.error('Usage: --config <path> --wave <n> [--platforms perplexity,chatgpt,gemini]');
    process.exit(1);
  }

  const configPath = args[configIdx + 1];
  const wave = parseInt(args[waveIdx + 1]);
  const platformList = platformsIdx !== -1
    ? args[platformsIdx + 1].split(',').map(s => s.trim())
    : ['perplexity', 'chatgpt', 'gemini'];

  if (!fs.existsSync(configPath)) { console.error(`Config not found: ${configPath}`); process.exit(1); }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const { study, prompts } = config;
  if (!study || !prompts?.length) { console.error('Config must have study and prompts[]'); process.exit(1); }

  for (const p of platformList) {
    if (!PLATFORM_CONFIG[p]) { console.error(`Unknown platform: ${p}`); process.exit(1); }
    if (!process.env[PLATFORM_CONFIG[p].envKey]) { console.error(`Missing env: ${PLATFORM_CONFIG[p].envKey}`); process.exit(1); }
  }

  console.log(`=== Experiment Scan: ${study} wave=${wave} platforms=${platformList.join(',')} ===`);
  console.log(`Prompts: ${prompts.length} | Runs per prompt per platform: ${RUNS_PER_PROMPT}`);

  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB connected.');

  let totalNew = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const prompt of prompts) {
    for (const platform of platformList) {
      const existing = await ExperimentRun.countDocuments({
        study, wave, promptId: prompt.id, platform, status: 'ok',
      });

      const needed = RUNS_PER_PROMPT - existing;
      if (needed <= 0) {
        console.log(`  [${prompt.id}/${platform}] ${existing}/${RUNS_PER_PROMPT} clean runs exist — skipping`);
        totalSkipped += RUNS_PER_PROMPT;
        continue;
      }

      console.log(`  [${prompt.id}/${platform}] ${existing}/${RUNS_PER_PROMPT} exist — need ${needed} more`);

      const maxAttempts = needed * MAX_RETRIES_FACTOR;
      let clean = 0;
      let attempts = 0;

      while (clean < needed && attempts < maxAttempts) {
        attempts++;
        try {
          const { text, citations, modelVersion } = await PLATFORM_CONFIG[platform].query(prompt.text);

          const targetResults = checkTargets(text, citations, prompt.targets || []);

          await ExperimentRun.create({
            study,
            wave,
            promptId: prompt.id,
            promptText: prompt.text,
            platform,
            modelVersion,
            modelParams: { max_tokens: 1024 },
            responseText: text,
            citedUrls: citations,
            targets: targetResults,
            status: 'ok',
          });

          clean++;
          totalNew++;
          const cited = targetResults.filter(t => t.cited).length;
          const mentioned = targetResults.filter(t => t.mentioned).length;
          console.log(`    run ${existing + clean}/${RUNS_PER_PROMPT} OK (${cited} cited, ${mentioned} mentioned)`);
        } catch (err) {
          totalErrors++;
          console.error(`    run attempt ${attempts} FAILED: ${err.message}`);
        }

        if (clean < needed) await sleep(INTER_CALL_DELAY_MS);
      }

      if (clean < needed) {
        console.error(`  ⚠ [${prompt.id}/${platform}] SHORTFALL: only ${existing + clean}/${RUNS_PER_PROMPT} clean runs after ${maxAttempts} attempts`);
      }
    }
  }

  console.log(`\n=== Done: ${totalNew} new runs, ${totalSkipped} already complete, ${totalErrors} errors ===`);
  await mongoose.disconnect();
}

main().catch(err => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });
