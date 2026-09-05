#!/usr/bin/env node

/**
 * parityProbe.js — Sonar vs Perplexity Agent API parity probe.
 *
 * Answers one question and nothing else:
 *
 *   Given the SAME fixed prompt, does the Agent API produce output TendorAI can
 *   process through the existing pipeline WITHOUT changing measurement semantics?
 *
 * ─── SAFETY PROPERTIES (structural, not just intentional) ────────────────────
 *
 *  1. THIS SCRIPT NEVER TOUCHES MONGODB. It does not import mongoose, does not
 *     import any model, and opens no database connection. It therefore CANNOT
 *     write to `experiment_runs` — under the real study key or any other. The
 *     throwaway key `study_probe_agent_parity` below is a provenance LABEL on
 *     the JSON output file, not a database key.
 *  2. It reads `data/experiments/exp001-config.json` READ-ONLY, purely to take
 *     the frozen prompt text and target entity names verbatim rather than
 *     retyping them. It never writes that file.
 *  3. It imports `isFirmMentioned` from the frozen matcher and CALLS it. It does
 *     not reimplement, wrap, or modify the matcher.
 *  4. It writes exactly one file: a JSON result blob, to the OS temp directory
 *     by default (override with --out). Nothing is written inside the repo.
 *  5. It runs no wave, tops up no cell, and mutates no research asset.
 *
 * ─── DOCUMENTATION CAVEAT — READ BEFORE SPENDING MONEY ───────────────────────
 *
 * At authoring time `docs.perplexity.ai` was blocked by this environment's
 * egress policy, so the Agent API REQUEST field names below could not be read
 * first-hand; they come from Perplexity's official documentation as surfaced
 * through search. RUN `--dry-run` FIRST and eyeball the printed request bodies
 * against the live docs before running for real. The RESPONSE side needs no
 * such trust: the probe discovers the shape and reports which one it found
 * (see lib/parityProbeLib.js), and an unrecognised payload is reported as a
 * shape failure, never as "zero citations".
 *
 * ─── ARMS ────────────────────────────────────────────────────────────────────
 *
 *  A  sonar          Current instrument, replicated EXACTLY: the openai SDK
 *                    against baseURL https://api.perplexity.ai, model 'sonar',
 *                    messages[], max_tokens 1024 — byte-identical to the request
 *                    in scripts/experiments/runExperimentScan.js:38-40.
 *  B  agent-pinned   Agent API with an explicitly pinned model + web_search tool
 *                    + an explicit instruction to cite numbered results (which
 *                    Perplexity's migration guide says is required to get the
 *                    inline [n] markers Sonar emits by default).
 *  C  agent-preset   Agent API with the dynamic preset Perplexity's migration
 *                    guide maps 'sonar' onto.
 *
 * ─── USAGE ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/experiments/parityProbe.js --dry-run
 *   node scripts/experiments/parityProbe.js --runs 10
 *   node scripts/experiments/parityProbe.js --arms sonar,agent-pinned --runs 3
 *   node scripts/experiments/parityProbe.js --out /tmp/parity.json
 *
 * Requires PERPLEXITY_API_KEY in the environment (Render shell has it).
 * Run it from the repo root.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// The frozen matcher, imported and CALLED — never reimplemented.
import { isFirmMentioned } from './lib/mentionMatcher.js';
import {
  extractAnswerText,
  extractCitations,
  checkIdIndexAlignment,
  summariseStructure,
  summariseArm,
  hasInlineMarkers,
  markerNumbers,
  hostOf,
  jaccard,
} from './lib/parityProbeLib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Provenance label only. NOT a database key — this script never connects to a
// database. Named to be obviously disposable if it ever reaches one.
const PROBE_STUDY_KEY = 'study_probe_agent_parity';

// The single fixed prompt, taken verbatim from the frozen EXP-001 config.
const FROZEN_CONFIG = path.join(REPO_ROOT, 'data/experiments/exp001-config.json');
const PROMPT_ID = 'bolton-best';

const SONAR_BASE_URL = 'https://api.perplexity.ai';
const AGENT_URL = 'https://api.perplexity.ai/v1/agent';

// Doc-sourced (via search), UNVERIFIED first-hand. Check with --dry-run.
const AGENT_PINNED_MODEL = process.env.PROBE_AGENT_MODEL || 'perplexity/sonar';
const AGENT_PRESET = process.env.PROBE_AGENT_PRESET || 'fast';

// Perplexity's migration guide: the Agent API does not emit inline [n] markers
// by default; you ask for them in `instructions`.
const CITE_INSTRUCTION =
  'Cite the numbered web search results inline in your answer using bracketed '
  + 'markers such as [1], [2], matching the id of the search result you used.';

const REQUEST_TIMEOUT_MS = 120000; // generous: an agent run is multi-step
const INTER_CALL_DELAY_MS = 2000;  // matches runExperimentScan.js pacing

// ─── CLI ─────────────────────────────────────────────────────────────────────

function argVal(flag, def = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const DRY_RUN = process.argv.includes('--dry-run');
const RUNS = parseInt(argVal('--runs', '10'), 10);
const ARMS = (argVal('--arms', 'sonar,agent-pinned,agent-preset') || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const OUT_PATH = argVal('--out', path.join(os.tmpdir(), `parity-probe-${Date.now()}.json`));

if (!Number.isInteger(RUNS) || RUNS < 1 || RUNS > 50) {
  console.error('--runs must be an integer 1..50 (this is a probe, not a wave)');
  process.exit(1);
}

const VALID_ARMS = ['sonar', 'agent-pinned', 'agent-preset'];
for (const a of ARMS) {
  if (!VALID_ARMS.includes(a)) {
    console.error(`Unknown arm "${a}". Valid: ${VALID_ARMS.join(', ')}`);
    process.exit(1);
  }
}

// ─── Frozen prompt, read-only ────────────────────────────────────────────────

function loadFrozenPrompt() {
  if (!fs.existsSync(FROZEN_CONFIG)) {
    console.error(`Frozen config not found: ${FROZEN_CONFIG}`);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(FROZEN_CONFIG, 'utf8'));
  const prompt = (config.prompts || []).find((p) => p.id === PROMPT_ID);
  if (!prompt) {
    console.error(`Prompt id "${PROMPT_ID}" not present in ${FROZEN_CONFIG}`);
    process.exit(1);
  }
  const entityNames = [...new Set(
    (prompt.targets || []).map((t) => t.entityName).filter(Boolean),
  )];
  return { text: prompt.text, city: prompt.city, entityNames, study: config.study };
}

// ─── Request builders (printed verbatim by --dry-run) ────────────────────────

function sonarRequest(promptText) {
  // Byte-identical to runExperimentScan.js:38-40.
  return { model: 'sonar', messages: [{ role: 'user', content: promptText }], max_tokens: 1024 };
}

function agentPinnedRequest(promptText) {
  return {
    model: AGENT_PINNED_MODEL,
    input: promptText,
    instructions: CITE_INSTRUCTION,
    tools: [{ type: 'web_search' }],
    max_output_tokens: 1024,
  };
}

function agentPresetRequest(promptText) {
  return {
    preset: AGENT_PRESET,
    input: promptText,
    instructions: CITE_INSTRUCTION,
    max_output_tokens: 1024,
  };
}

const ARM_SPEC = {
  'sonar':        { url: `${SONAR_BASE_URL}/chat/completions`, build: sonarRequest },
  'agent-pinned': { url: AGENT_URL,                            build: agentPinnedRequest },
  'agent-preset': { url: AGENT_URL,                            build: agentPresetRequest },
};

// ─── Transport ───────────────────────────────────────────────────────────────

/**
 * Arm A goes through the SAME SDK the research runner uses, so the probe
 * measures the real instrument rather than a re-implementation of it. Imported
 * dynamically so --dry-run works in an environment without node_modules.
 */
async function callSonar(body, apiKey) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, baseURL: SONAR_BASE_URL });
  const resp = await client.chat.completions.create(body);
  return { raw: resp, httpStatus: 200 };
}

/** Arms B/C: plain fetch — the Agent API is not the chat-completions shape. */
async function callAgent(body, apiKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* reported as a shape failure below */ }
    if (!resp.ok) {
      const retryAfter = resp.headers.get('retry-after');
      const err = new Error(`HTTP ${resp.status}${retryAfter ? ` (retry-after: ${retryAfter})` : ''}: ${text.slice(0, 400)}`);
      err.httpStatus = resp.status;
      err.retryAfter = retryAfter;
      throw err;
    }
    return { raw: parsed, httpStatus: resp.status, rawText: parsed === null ? text : undefined };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── One run ─────────────────────────────────────────────────────────────────

async function doRun(arm, promptText, entityNames, apiKey) {
  const spec = ARM_SPEC[arm];
  const body = spec.build(promptText);
  const started = Date.now();
  try {
    const { raw, httpStatus, rawText } = arm === 'sonar'
      ? await callSonar(body, apiKey)
      : await callAgent(body, apiKey);
    const latencyMs = Date.now() - started;

    const { shape: answerShape, text } = extractAnswerText(raw);
    const { shape: citationShape, entries } = extractCitations(raw);

    // Frozen matcher, called directly. One boolean per target entity name.
    const mentionedNames = {};
    for (const name of entityNames) mentionedNames[name] = isFirmMentioned(text, name);

    // "Did a search actually run?" Sonar always retrieves. On the Agent API
    // web_search is a tool the model may decline to call — so a search-results
    // output item (or any citation at all) is the evidence it ran. Recorded as
    // observed, never assumed.
    const searchRan = arm === 'sonar'
      ? entries.length > 0
      : (Array.isArray(raw?.output)
        && raw.output.some((i) => typeof i?.type === 'string' && i.type.toLowerCase().includes('search')))
        || entries.length > 0;

    return {
      ok: true,
      arm,
      httpStatus,
      latencyMs,
      answerShape,
      citationShape,
      text,
      textLength: text.length,
      markers: markerNumbers(text),
      hasMarkers: hasInlineMarkers(text),
      entries,
      idAlignment: checkIdIndexAlignment(entries),
      searchRan,
      structure: summariseStructure(raw),
      unparsedBody: rawText ? rawText.slice(0, 2000) : undefined,
      usage: raw?.usage ?? null,
      modelReported: raw?.model ?? null,
      raw,
    };
  } catch (err) {
    return {
      ok: false,
      arm,
      httpStatus: err.httpStatus ?? null,
      retryAfter: err.retryAfter ?? null,
      latencyMs: Date.now() - started,
      error: err.message,
    };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const frozen = loadFrozenPrompt();

  console.log('='.repeat(72));
  console.log('PERPLEXITY SONAR → AGENT API PARITY PROBE');
  console.log('='.repeat(72));
  console.log(`Provenance label : ${PROBE_STUDY_KEY}  (label only — no database is opened)`);
  console.log(`Frozen source    : ${path.relative(REPO_ROOT, FROZEN_CONFIG)} (read-only)`);
  console.log(`Source study     : ${frozen.study}  [NOT written to]`);
  console.log(`Prompt id        : ${PROMPT_ID}`);
  console.log(`Prompt text      : ${JSON.stringify(frozen.text)}`);
  console.log(`City             : ${frozen.city}`);
  console.log(`Target entities  : ${frozen.entityNames.length}`);
  console.log(`Arms             : ${ARMS.join(', ')}`);
  console.log(`Runs per arm     : ${RUNS}`);
  console.log('');

  if (DRY_RUN) {
    console.log('--- DRY RUN: no network calls. Check these against the live docs. ---\n');
    for (const arm of ARMS) {
      console.log(`ARM ${arm}`);
      console.log(`  POST ${ARM_SPEC[arm].url}`);
      console.log('  Authorization: Bearer $PERPLEXITY_API_KEY');
      console.log('  Content-Type: application/json');
      console.log(`  body: ${JSON.stringify(ARM_SPEC[arm].build(frozen.text), null, 2).split('\n').join('\n  ')}`);
      console.log('');
    }
    console.log('Agent-arm request field names are doc-sourced via search and NOT');
    console.log('verified first-hand. Confirm against docs.perplexity.ai before a live run.');
    return;
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error('PERPLEXITY_API_KEY is not set. Run this on the Render shell, or use --dry-run.');
    process.exit(1);
  }

  const results = {};
  for (const arm of ARMS) {
    console.log(`--- ARM ${arm} ---`);
    results[arm] = [];
    for (let i = 0; i < RUNS; i++) {
      const rec = await doRun(arm, frozen.text, frozen.entityNames, apiKey);
      results[arm].push(rec);
      if (rec.ok) {
        const hits = Object.values(rec.mentionedNames || {}).filter(Boolean).length;
        console.log(
          `  run ${i + 1}/${RUNS} ok  ${rec.latencyMs}ms  answer=${rec.answerShape}  `
          + `citations=${rec.citationShape}(${rec.entries.length})  markers=${rec.hasMarkers}  `
          + `idAlign=${rec.idAlignment.verdict}  search=${rec.searchRan}  mentions=${hits}`,
        );
        if (rec.answerShape === null || rec.citationShape === null) {
          console.log(`      !! UNRECOGNISED SHAPE — top-level keys: ${rec.structure.topLevelKeys.join(', ')}`);
          if (rec.structure.outputItemTypes) {
            console.log(`         output[] item types: ${rec.structure.outputItemTypes.join(', ')}`);
          }
        }
      } else {
        console.log(`  run ${i + 1}/${RUNS} FAILED  ${rec.httpStatus ?? '-'}  ${rec.error}`);
      }
      if (i < RUNS - 1) await sleep(INTER_CALL_DELAY_MS);
    }
    console.log('');
  }

  // ── Comparison ──
  const summaries = {};
  for (const arm of ARMS) summaries[arm] = summariseArm(results[arm]);

  const baselineHosts = new Set(summaries.sonar?.distinctHosts || []);
  const overlap = {};
  for (const arm of ARMS) {
    if (arm === 'sonar') continue;
    overlap[arm] = jaccard(baselineHosts, new Set(summaries[arm].distinctHosts));
  }

  console.log('='.repeat(72));
  console.log('SUMMARY');
  console.log('='.repeat(72));
  for (const arm of ARMS) {
    const s = summaries[arm];
    console.log(`\n${arm}`);
    console.log(`  ok/attempted        ${s.ok}/${s.attempted}`);
    console.log(`  answer shape(s)     ${s.answerShapes.join(', ') || '-'}`);
    console.log(`  citation shape(s)   ${s.citationShapes.join(', ') || '-'}`);
    console.log(`  unknown shapes      answer=${s.unknownAnswerShapeRuns} citation=${s.unknownCitationShapeRuns}`);
    console.log(`  [n] marker rate     ${s.markerRate === null ? '-' : s.markerRate.toFixed(2)}`);
    console.log(`  search ran rate     ${s.searchRanRate === null ? '-' : s.searchRanRate.toFixed(2)}`);
    console.log(`  citations min/mean/max  ${s.citationCount.min}/${s.citationCount.mean?.toFixed(1)}/${s.citationCount.max}`);
    console.log(`  mention rate        ${s.mention.hits}/${s.mention.checks} = ${s.mention.rate === null ? '-' : s.mention.rate.toFixed(4)}`);
    console.log(`  distinct hosts      ${s.distinctHosts.length}`);
    console.log(`  latency mean ms     ${s.latencyMs.mean === null ? '-' : Math.round(s.latencyMs.mean)}`);
    if (arm !== 'sonar') console.log(`  host Jaccard vs sonar   ${overlap[arm]?.toFixed(3)}`);
    const aligns = [...new Set(results[arm].filter((r) => r.ok).map((r) => r.idAlignment.verdict))];
    console.log(`  id/index alignment  ${aligns.join(', ') || '-'}`);
  }

  const blob = {
    probeStudyKey: PROBE_STUDY_KEY,
    generatedAt: new Date().toISOString(),
    note: 'Provenance label only. This probe never opened a database connection.',
    frozenSource: { file: 'data/experiments/exp001-config.json', promptId: PROMPT_ID, study: frozen.study },
    prompt: frozen.text,
    entityNames: frozen.entityNames,
    runsPerArm: RUNS,
    requests: Object.fromEntries(ARMS.map((a) => [a, { url: ARM_SPEC[a].url, body: ARM_SPEC[a].build(frozen.text) }])),
    summaries,
    hostJaccardVsSonar: overlap,
    runs: results,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(blob, null, 2));
  console.log(`\nFull result written to ${OUT_PATH}`);
  console.log('(Nothing was written inside the repository, and no database was opened.)');
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
