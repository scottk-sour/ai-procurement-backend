import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import { PILLAR_LIBRARIES, VERTICAL_ENTITIES } from './contentPlanner/pillarLibraries.js';
import { SYSTEM_PROMPT_V7, VERTICAL_LABELS } from './contentPlanner/prompts.js';
import { buildUserPrompt } from '../routes/vendorPostRoutes.js';
import { findOrCreateRun, startRun, completeRun, failRun } from './agentRun.js';
import { createApproval } from './approvalQueue.js';

const SONNET_INPUT_COST_PER_M = 3.00;
const SONNET_OUTPUT_COST_PER_M = 15.00;
const MONTHLY_COST_CAP_USD = 75;
const MONTHLY_PER_VENDOR_CAP = 4;
const MODEL = 'claude-sonnet-4-20250514';

const PRO_TIERS = new Set(['pro', 'managed', 'verified', 'enterprise']);

function isProTier(tier) {
  return PRO_TIERS.has(tier);
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

async function getVendorRunCountThisMonth(vendorId) {
  const { start, end } = getMonthRange();
  return AgentRun.countDocuments({
    vendorId,
    agentName: 'writer',
    weekStarting: { $gte: start, $lt: end },
    status: { $in: ['completed', 'partial'] },
  });
}

async function getPlatformCostThisMonth() {
  const { start, end } = getMonthRange();
  const runs = await AgentRun.find({
    agentName: 'writer',
    weekStarting: { $gte: start, $lt: end },
    status: { $in: ['completed', 'partial'] },
    'artifacts.costEstimateUSD': { $exists: true },
  }).select('artifacts.costEstimateUSD').lean();

  return runs.reduce((sum, r) => sum + (r.artifacts?.costEstimateUSD || 0), 0);
}

function resolveNextTopic(vendorType, lastPillar, lastTopicIndex) {
  const pillars = PILLAR_LIBRARIES[vendorType];
  if (!pillars || !pillars.length) return null;

  if (lastPillar === undefined || lastPillar === null) {
    const p = pillars[0];
    return { pillarIndex: 0, pillarId: p.id, topicIndex: 0, topic: p.topics[0], pillarName: p.name };
  }

  const currentPillarIdx = pillars.findIndex(p => p.id === lastPillar);
  if (currentPillarIdx === -1) {
    const p = pillars[0];
    return { pillarIndex: 0, pillarId: p.id, topicIndex: 0, topic: p.topics[0], pillarName: p.name };
  }

  const currentPillar = pillars[currentPillarIdx];
  const nextTopicIdx = (lastTopicIndex ?? -1) + 1;

  if (nextTopicIdx < currentPillar.topics.length) {
    return {
      pillarIndex: currentPillarIdx,
      pillarId: currentPillar.id,
      topicIndex: nextTopicIdx,
      topic: currentPillar.topics[nextTopicIdx],
      pillarName: currentPillar.name,
    };
  }

  const nextPillarIdx = (currentPillarIdx + 1) % pillars.length;
  const nextPillar = pillars[nextPillarIdx];
  return {
    pillarIndex: nextPillarIdx,
    pillarId: nextPillar.id,
    topicIndex: 0,
    topic: nextPillar.topics[0],
    pillarName: nextPillar.name,
  };
}

export async function runWriterAgentForVendor(vendorId, options = {}) {
  const { dryRun = false } = options;
  const logPrefix = dryRun ? '[WriterAgent DRY-RUN]' : '[WriterAgent]';

  const vendor = await Vendor.findById(vendorId)
    .select('tier vendorType company location.city practiceAreas')
    .lean();
  if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

  if (!isProTier(vendor.tier)) {
    return { skipped: true, reason: 'not_pro_tier', vendorId: String(vendorId) };
  }

  const pillars = PILLAR_LIBRARIES[vendor.vendorType];
  if (!pillars || !pillars.length) {
    console.log(`${logPrefix} No pillar library for vendorType: ${vendor.vendorType}`);
    return { skipped: true, reason: 'no_pillar_library_for_vertical', vendorId: String(vendorId) };
  }

  const vendorRunCount = await getVendorRunCountThisMonth(vendorId);
  if (vendorRunCount >= MONTHLY_PER_VENDOR_CAP) {
    return { skipped: true, reason: 'monthly_per_vendor_cap_reached', vendorId: String(vendorId) };
  }

  const lastRun = await AgentRun.findOne({
    vendorId,
    agentName: 'writer',
    status: 'completed',
  }).sort({ weekStarting: -1 }).lean();

  const lastPillar = lastRun?.artifacts?.lastPillar ?? null;
  const lastTopicIndex = lastRun?.artifacts?.lastTopicIndex ?? null;

  const next = resolveNextTopic(vendor.vendorType, lastPillar, lastTopicIndex);
  if (!next || !next.topic) {
    return { skipped: true, reason: 'no_topics_in_pillar_library', vendorId: String(vendorId) };
  }

  const agentRun = await findOrCreateRun({ vendorId, agentName: 'writer' });
  if (agentRun.status === 'completed' || agentRun.status === 'partial') {
    return { skipped: true, reason: 'already_ran_this_week', vendorId: String(vendorId) };
  }

  await startRun(agentRun._id);

  const verticalLabel = VERTICAL_LABELS[vendor.vendorType] || vendor.vendorType;
  const vendorTypeEntities = VERTICAL_ENTITIES[vendor.vendorType] || [];
  const pillarSpec = { ...next.topic, pillarName: next.pillarName };

  const topicTitle = (next.topic.title || '')
    .replace(/\{city\}/g, vendor.location?.city || 'your city')
    .replace(/\{specialism\}/g, vendor.practiceAreas?.[0] || 'your main service area')
    .replace(/\{firmName\}/g, vendor.company || 'your firm')
    .replace(/\{year\}/g, String(new Date().getFullYear()));

  const userPrompt = buildUserPrompt({
    topic: topicTitle,
    stats: '',
    primaryData: '',
    verticalLabel,
    vendorCity: vendor.location?.city,
    vendorName: vendor.company,
    pillarSpec,
    vendorTypeEntities,
    linkedInHookType: next.topic.linkedInHookType || 'opinion',
  });

  let response;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.7,
      system: SYSTEM_PROMPT_V7,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (err) {
    await failRun(agentRun._id, { failureReason: `claude_api_error: ${err.message}` });
    return { success: false, error: err.message, vendorId: String(vendorId) };
  }

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    await failRun(agentRun._id, { failureReason: 'ai_response_parse_failed' });
    return { success: false, error: 'ai_response_parse_failed', vendorId: String(vendorId) };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    await failRun(agentRun._id, { failureReason: `ai_response_json_invalid: ${err.message}` });
    return { success: false, error: 'ai_response_json_invalid', vendorId: String(vendorId) };
  }

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const costEstimateUSD = (inputTokens / 1_000_000 * SONNET_INPUT_COST_PER_M) +
                          (outputTokens / 1_000_000 * SONNET_OUTPUT_COST_PER_M);

  const platformCostSoFar = await getPlatformCostThisMonth();
  const projectedTotal = platformCostSoFar + costEstimateUSD;
  if (projectedTotal > MONTHLY_COST_CAP_USD) {
    console.error(`${logPrefix} COST CAP HIT: projected $${projectedTotal.toFixed(2)} exceeds $${MONTHLY_COST_CAP_USD} cap. Failing run.`);
    await failRun(agentRun._id, {
      failureReason: `monthly_cost_cap_would_be_exceeded: projected $${projectedTotal.toFixed(2)} > $${MONTHLY_COST_CAP_USD}`,
      partialArtifacts: { costEstimateUSD, platformCostSoFar, projectedTotal },
    });
    return { success: false, error: 'monthly_cost_cap_reached', vendorId: String(vendorId) };
  }

  const approval = await createApproval({
    vendorId,
    agentName: 'writer',
    itemType: 'content_draft',
    title: `Draft: ${parsed.title}`,
    draftPayload: {
      title: parsed.title,
      body: parsed.body,
      linkedInText: parsed.linkedInText || '',
      facebookText: parsed.facebookText || '',
      pillar: next.pillarId,
      plan: {
        pillar: next.pillarId,
        tactic: next.topic.tactic,
        mustInclude: next.topic.mustInclude,
        namedEntities: next.topic.namedEntities,
        primaryDataHook: next.topic.primaryDataHook,
        wordCount: next.topic.wordCount,
        primaryAIQuery: next.topic.primaryAIQuery,
        secondaryQueries: next.topic.secondaryQueries,
      },
      topic: topicTitle,
      category: 'guide',
      tags: [next.pillarId, vendor.vendorType, vendor.location?.city?.toLowerCase()].filter(Boolean),
    },
    metadata: {
      agentRunId: agentRun._id,
      pillarId: next.pillarId,
      topicIndex: next.topicIndex,
      costEstimateUSD,
      inputTokens,
      outputTokens,
      model: MODEL,
      ...(dryRun ? { dryRun: true } : {}),
    },
    source: 'writer-agent-cron',
  });

  const summary = `Drafted "${parsed.title}" for ${next.pillarId} pillar (topic ${next.topicIndex}). Approval pending. Estimated cost $${costEstimateUSD.toFixed(4)}.`;

  await completeRun(agentRun._id, {
    summary,
    artifacts: {
      pillarId: next.pillarId,
      topicIndex: next.topicIndex,
      lastPillar: next.pillarId,
      lastTopicIndex: next.topicIndex,
      postsDrafted: 1,
      draftTitle: parsed.title,
      costEstimateUSD,
      inputTokens,
      outputTokens,
      model: MODEL,
    },
    metricsAfter: { writerAgentMonthlyCostUSD: projectedTotal },
    relatedApprovalIds: [approval._id],
  });

  console.log(`${logPrefix} ${vendor.company}: drafted "${parsed.title}" ($${costEstimateUSD.toFixed(4)})`);

  return {
    success: true,
    approvalId: approval._id,
    agentRunId: agentRun._id,
    costEstimateUSD,
    pillarId: next.pillarId,
    topicIndex: next.topicIndex,
    draftTitle: parsed.title,
    vendorId: String(vendorId),
    ...(dryRun ? { dryRun: true } : {}),
  };
}

export { resolveNextTopic, isProTier, MONTHLY_COST_CAP_USD, MONTHLY_PER_VENDOR_CAP, SONNET_INPUT_COST_PER_M, SONNET_OUTPUT_COST_PER_M };
