#!/usr/bin/env node
/**
 * Proves the publish guard blocks fabricated statistics across all four verticals.
 * No DB — calls validateContentDraft directly with fixture text.
 * Usage: node scripts/prove-fabrication-guard.js
 */
import { validateContentDraft } from '../services/contentPlanner/validators.js';

const fabricated = {
  solicitor: 'Law Society data shows 73% of conveyancing cases settle within 8 weeks.',
  accountant: 'Xero analysis reveals 61% of sole traders overpay tax each year.',
  'mortgage-adviser': 'Bank of England data shows 38% of remortgages complete late.',
  'estate-agent': 'Propertymark data shows correctly priced homes sell 40% faster.',
};

const clean = 'Our conveyancing fees start from a fixed amount plus VAT, and most cases complete in around eight weeks.';

let failures = 0;

for (const [vertical, body] of Object.entries(fabricated)) {
  const result = validateContentDraft({ body });
  const blocked = !result.passed && result.errors.some(e => e.startsWith('Fabricated statistic'));
  console.log(`${blocked ? 'PASS' : 'FAIL'} [${vertical}] blocked=${blocked}`);
  if (!blocked) { failures++; console.log('   errors:', JSON.stringify(result.errors)); }
}

const cleanResult = validateContentDraft({ body: clean });
const cleanOk = cleanResult.errors.every(e => !e.startsWith('Fabricated statistic'));
console.log(`${cleanOk ? 'PASS' : 'FAIL'} [clean control] no false positive=${cleanOk}`);
if (!cleanOk) { failures++; console.log('   errors:', JSON.stringify(cleanResult.errors)); }

// Regression: honest sentences with substring matches must NOT be blocked
const honestSentences = {
  'transactions-substring': 'We handle hundreds of property transactions; data shows around 200 each year.',
  'completions-substring': 'Our completions reports indicate we processed 150 cases last quarter.',
};

for (const [label, body] of Object.entries(honestSentences)) {
  const result = validateContentDraft({ body });
  const falsePositive = result.errors.some(e => e.startsWith('Fabricated statistic'));
  const ok = !falsePositive;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${label}] not blocked=${ok}`);
  if (!ok) { failures++; console.log('   errors:', JSON.stringify(result.errors)); }
}

console.log(failures === 0 ? '\nALL GUARDS HOLD' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
