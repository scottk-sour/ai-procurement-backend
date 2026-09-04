/**
 * loadClaims.js — read-only loader + validator for the AI-visibility content
 * claim registry (data/experiments/visibility-content-claims.json).
 *
 * The registry binds a target claim to an article URL (see D1: binding is by
 * URL, not by prompt). This loader reads the registry AND the frozen study
 * config, cross-validates them, and returns the parsed registry (including
 * `frozen`, so callers can enforce D2: refuse a wave >= 2 export while the
 * registry is unfrozen). It NEVER modifies either file, and it never duplicates
 * the config's prompt IDs locally — the config is the source of truth for which
 * prompt IDs (and their intents) exist.
 *
 * Throws on any validation failure so callers fail loudly rather than exporting
 * against a malformed or mismatched registry.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

export const DEFAULT_CLAIMS_PATH = path.join(REPO_ROOT, 'data/experiments/visibility-content-claims.json');
export const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'data/experiments/visibility-content-config.json');

// `frozen` (and registry entry `addedOn`) may be ISO (YYYY-MM-DD, as the config
// uses) or DD/MM/YYYY (as the entry-shape example uses). Accept either.
const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/;

function readJson(p, label) {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (err) {
    throw new Error(`loadClaims: cannot read ${label} at ${p}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`loadClaims: ${label} at ${p} is not valid JSON: ${err.message}`);
  }
}

function isAbsoluteHttpsUrl(u) {
  if (typeof u !== 'string' || u.length === 0) return false;
  try {
    return new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {{claimsPath?: string, configPath?: string}} [opts]
 * @returns {{study, panel, version, frozen, claims, promptIds:Set<string>, intentByPrompt:Map<string,string>, config}}
 */
export function loadClaims({ claimsPath = DEFAULT_CLAIMS_PATH, configPath = DEFAULT_CONFIG_PATH } = {}) {
  const config = readJson(configPath, 'study config');
  const registry = readJson(claimsPath, 'claim registry');

  // Prompt IDs + intents come from the config (never duplicated here).
  const promptIds = new Set();
  const intentByPrompt = new Map();
  for (const p of (config.prompts || [])) {
    if (p && p.id) {
      promptIds.add(p.id);
      if (p.intent) intentByPrompt.set(p.id, p.intent);
    }
  }
  if (promptIds.size === 0) {
    throw new Error(`loadClaims: study config at ${configPath} defines no prompts`);
  }

  // study / panel must match the config.
  if (registry.study !== config.study) {
    throw new Error(`loadClaims: registry study "${registry.study}" does not match config study "${config.study}"`);
  }
  if (registry.panel !== config.panel) {
    throw new Error(`loadClaims: registry panel "${registry.panel}" does not match config panel "${config.panel}"`);
  }

  // frozen is null or a date string.
  if (!(registry.frozen === null || (typeof registry.frozen === 'string' && DATE_RE.test(registry.frozen)))) {
    throw new Error(`loadClaims: registry "frozen" must be null or a date string (YYYY-MM-DD or DD/MM/YYYY), got: ${JSON.stringify(registry.frozen)}`);
  }

  if (!Array.isArray(registry.claims)) {
    throw new Error('loadClaims: registry "claims" must be an array');
  }

  const seenPromptIds = new Set();
  registry.claims.forEach((entry, i) => {
    const where = `registry.claims[${i}]`;
    if (!entry || typeof entry !== 'object') {
      throw new Error(`loadClaims: ${where} is not an object`);
    }
    // promptId exists in config, no duplicate promptId across claims.
    if (typeof entry.promptId !== 'string' || !promptIds.has(entry.promptId)) {
      throw new Error(`loadClaims: ${where} promptId "${entry.promptId}" is not a prompt in the config`);
    }
    if (seenPromptIds.has(entry.promptId)) {
      throw new Error(`loadClaims: ${where} duplicates promptId "${entry.promptId}" (each prompt may appear at most once)`);
    }
    seenPromptIds.add(entry.promptId);
    // articleUrl is an absolute https URL.
    if (!isAbsoluteHttpsUrl(entry.articleUrl)) {
      throw new Error(`loadClaims: ${where} articleUrl must be an absolute https URL, got: ${JSON.stringify(entry.articleUrl)}`);
    }
    // targetClaim must be a non-empty string (it is copied verbatim onto label rows).
    if (typeof entry.targetClaim !== 'string' || entry.targetClaim.trim().length === 0) {
      throw new Error(`loadClaims: ${where} targetClaim must be a non-empty string`);
    }
    // addedOn, when present, must be a date string.
    if (entry.addedOn !== undefined && !(typeof entry.addedOn === 'string' && DATE_RE.test(entry.addedOn))) {
      throw new Error(`loadClaims: ${where} addedOn must be a date string (YYYY-MM-DD or DD/MM/YYYY), got: ${JSON.stringify(entry.addedOn)}`);
    }
  });

  return {
    study: registry.study,
    panel: registry.panel,
    version: registry.version,
    frozen: registry.frozen,
    claims: registry.claims,
    promptIds,
    intentByPrompt,
    config,
  };
}
