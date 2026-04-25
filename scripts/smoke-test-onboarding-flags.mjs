/**
 * Manual post-deploy smoke-test for the onboarding-checklist
 * auto-detection wired into POST /api/vendors/:vendorId/posts/generate.
 *
 * NOT part of the automated test suite — vitest covers the same logic
 * with mocks in tests/unit/onboardingChecklist.test.js. This script
 * verifies the live integration end-to-end against a real DB and a
 * real Anthropic call after a deploy.
 *
 * Set up a test vendor before running:
 *   - vendorType: 'solicitor'
 *   - tier: 'pro' (or any paid tier)
 *   - location.city: any string
 *   - practiceAreas: ['Conveyancing']  (so the pillar lookup works)
 *   - onboardingChecklist.firstPillarPostGenerated: false
 *   - onboardingChecklist.firstPrimaryDataAdded:  false
 *
 * Usage:
 *   MONGODB_URI=mongodb+srv://... \
 *   ANTHROPIC_API_KEY=sk-... \
 *   JWT_SECRET=... \
 *   VENDOR_ID=<bson-id> \
 *   BASE_URL=http://localhost:5000 \
 *     npm run smoke:onboarding
 *
 * Tests performed:
 *   1. First generate — both flags should flip to true with recent
 *      timestamps (within 60s).
 *   2. Second generate (after a 2s wait) — both flags stay true and
 *      both timestamps are unchanged from Test 1 (idempotency).
 *
 * Requires the backend server to be running and reachable at BASE_URL.
 * The script connects to Mongo directly to read the vendor doc before
 * and after each request.
 */

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Vendor from '../models/Vendor.js';

const {
  MONGODB_URI,
  JWT_SECRET,
  VENDOR_ID,
  BASE_URL = 'http://localhost:5000',
} = process.env;

if (!MONGODB_URI || !JWT_SECRET || !VENDOR_ID) {
  console.error('Missing required env: MONGODB_URI, JWT_SECRET, VENDOR_ID');
  console.error('See header comment for setup.');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const token = jwt.sign({ vendorId: VENDOR_ID }, JWT_SECRET);

const body = {
  topic: 'How much does conveyancing cost in Cardiff in 2026?',
  pillar: 'costs-fees',
  topicIndex: 0,
  primaryData:
    'Based on our last 247 conveyancing transactions in Cardiff, the typical all-in cost is £1,850.',
};

async function generate() {
  const res = await fetch(`${BASE_URL}/api/vendors/${VENDOR_ID}/posts/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function readChecklist() {
  const v = await Vendor.findById(VENDOR_ID).select('onboardingChecklist').lean();
  return v?.onboardingChecklist || {};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const recent = (d) => d && (Date.now() - new Date(d).getTime()) < 60_000;
const sameTs = (a, b) => a && b && new Date(a).getTime() === new Date(b).getTime();

let exitCode = 0;

// ─── Test 1 ─────────────────────────────────────────────────────────
console.log('--- Test 1: first generate, both flags should flip ---');
const before = await readChecklist();
console.log('before:', {
  firstPillarPostGenerated: before.firstPillarPostGenerated,
  firstPrimaryDataAdded: before.firstPrimaryDataAdded,
});
if (before.firstPillarPostGenerated || before.firstPrimaryDataAdded) {
  console.error('Pre-condition failed: both flags must be false. Reset and re-run.');
  await mongoose.disconnect();
  process.exit(1);
}

const r1 = await generate();
console.log('response status:', r1.status);
console.log('response keys:', r1.json ? Object.keys(r1.json) : '(no body)');

await sleep(500); // give the fire-and-forget updateOne a moment
const after1 = await readChecklist();
console.log('after Test 1:', {
  firstPillarPostGenerated: after1.firstPillarPostGenerated,
  firstPillarPostGeneratedAt: after1.firstPillarPostGeneratedAt,
  firstPrimaryDataAdded: after1.firstPrimaryDataAdded,
  firstPrimaryDataAddedAt: after1.firstPrimaryDataAddedAt,
});

const test1Pass =
  r1.status === 200
  && after1.firstPillarPostGenerated === true
  && recent(after1.firstPillarPostGeneratedAt)
  && after1.firstPrimaryDataAdded === true
  && recent(after1.firstPrimaryDataAddedAt);
console.log(test1Pass ? 'TEST 1: PASS' : 'TEST 1: FAIL');
if (!test1Pass) exitCode = 1;

const pillarAt1 = after1.firstPillarPostGeneratedAt;
const primaryAt1 = after1.firstPrimaryDataAddedAt;

// ─── Test 2 ─────────────────────────────────────────────────────────
console.log('\n--- Test 2: second generate, timestamps must NOT change ---');
await sleep(2_000);
const r2 = await generate();
console.log('response status:', r2.status);

await sleep(500);
const after2 = await readChecklist();
console.log('after Test 2:', {
  firstPillarPostGenerated: after2.firstPillarPostGenerated,
  firstPillarPostGeneratedAt: after2.firstPillarPostGeneratedAt,
  firstPrimaryDataAdded: after2.firstPrimaryDataAdded,
  firstPrimaryDataAddedAt: after2.firstPrimaryDataAddedAt,
});

const test2Pass =
  r2.status === 200
  && after2.firstPillarPostGenerated === true
  && after2.firstPrimaryDataAdded === true
  && sameTs(after2.firstPillarPostGeneratedAt, pillarAt1)
  && sameTs(after2.firstPrimaryDataAddedAt, primaryAt1);
console.log(test2Pass ? 'TEST 2: PASS' : 'TEST 2: FAIL');
if (!test2Pass) exitCode = 1;

await mongoose.disconnect();
console.log(`\nFinal: ${exitCode === 0 ? 'PASS' : 'FAIL'}`);
process.exit(exitCode);
