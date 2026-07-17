import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import { PILLAR_LIBRARIES, VERTICAL_ENTITIES } from './contentPlanner/pillarLibraries.js';
import { SYSTEM_PROMPT_WRITER_V1_1, VERTICAL_LABELS, ORG_NAME_BAN } from './contentPlanner/prompts.js';
import { getFirmContext, renderFirmContextBlock } from './contentPlanner/firmContext.js';
import { reviewDraftForFabrication } from './contentPlanner/fabricationReview.js';
import { countAllPlaceholders as countPlaceholders } from './writerAgent/parsePlaceholders.js';
import { buildUserPrompt } from '../routes/vendorPostRoutes.js';
import { findOrCreateRun, startRun, completeRun, failRun } from './agentRun.js';
import { createApproval, latestRejectionReason } from './approvalQueue.js';
import { buildCtaForVendor, detectPossibleFabrication } from './contentPlanner/writerGuards.js';
import { FIRM_DATA_KEYS } from './writerAgent/firmDataKeys.js';
import { localiseNamedEntities, buildJurisdictionRulesBlock } from './contentReview/groundTruth.js';
import { validateDraft } from './contentReview/validateDraft.js';
import { verifyClaims } from './contentReview/verifyClaims.js';
import { resolveJurisdiction } from '../lib/config/jurisdictions.js';
import { profileFor } from '../lib/config/industryProfiles.js';
import { extractFirstJsonObject } from './contentReview/jsonExtract.js';

import { SONNET_MODEL } from '../lib/config/models.js';

const SONNET_INPUT_COST_PER_M = 3.00;
const SONNET_OUTPUT_COST_PER_M = 15.00;
const MONTHLY_COST_CAP_USD = 75;
// 3 articles/week × ~4.33 weeks = max 14/month. Matches Pro tier promise in tendorai-what-you-get.pdf.
const MONTHLY_PER_VENDOR_CAP = 100;
const MODEL = SONNET_MODEL;

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

  const vendor = await Vendor.findById(vendorId).lean();
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

  // Per-day throttle: prevent duplicate runs within the same UTC day.
  // Each Mon/Wed/Fri cron firing is its own slot.
  // Dry-runs bypass the throttle (manual verification shouldn't be blocked).
  if (!dryRun) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

    const existingToday = await AgentRun.findOne({
      vendorId,
      agentName: 'writer',
      createdAt: { $gte: todayStart, $lt: todayEnd },
      status: { $in: ['completed', 'partial'] },
    });
    if (existingToday) {
      return { skipped: true, reason: 'already_ran_today', vendorId: String(vendorId) };
    }
  }

  // Each Mon/Wed/Fri firing gets its own AgentRun document.
  // Do NOT use findOrCreateRun here — it normalises to Monday of the week,
  // so Wed/Fri would corrupt Monday's completed record.
  const agentRun = new AgentRun({
    vendorId,
    agentName: 'writer',
    weekStarting: AgentRun.normaliseWeekStarting(new Date()),
    status: 'pending',
  });
  await agentRun.save();
  await startRun(agentRun._id);

  const verticalLabel = VERTICAL_LABELS[vendor.vendorType] || vendor.vendorType;
  const vendorTypeEntities = VERTICAL_ENTITIES[vendor.vendorType] || [];
  const pillarSpec = { ...next.topic, pillarName: next.pillarName };

  const topicTitle = (next.topic.title || '')
    .replace(/\{city\}/g, vendor.location?.city || 'your city')
    .replace(/\{specialism\}/g, vendor.practiceAreas?.[0] || 'your main service area')
    .replace(/\{firmName\}/g, vendor.company || 'your firm')
    .replace(/\{year\}/g, String(new Date().getFullYear()));

  let firmContext;
  try {
    firmContext = await getFirmContext(vendorId);
  } catch (err) {
    await failRun(agentRun._id, { failureReason: `firm_context_fetch_failed: ${err.message}` });
    return { success: false, error: 'firm_context_fetch_failed', vendorId: String(vendorId) };
  }
  const firmContextBlock = renderFirmContextBlock(firmContext);

  // Identify which pillar-required data keys are missing from firm context
  const dataGaps = [];
  const firmContextStr = firmContextBlock.toLowerCase();
  for (const [key, label] of Object.entries(FIRM_DATA_KEYS)) {
    if (!firmContextStr.includes(key.toLowerCase()) && !firmContextStr.includes(label.toLowerCase().split('(')[0].trim())) {
      dataGaps.push({ key, label });
    }
  }

  const { regime: _regime } = resolveJurisdiction(firmContext?._rawFirmForGate || {});
  if (pillarSpec && pillarSpec.namedEntities) {
    pillarSpec.namedEntities = localiseNamedEntities(pillarSpec.namedEntities, _regime);
  }

  const cta = buildCtaForVendor(vendor);
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
    ctaUrl: cta.ctaUrl,
    ctaText: cta.ctaText,
    allowedFirmDataKeys: {},
  });

  // Strip unfilled template patterns from the prompt so the model never sees
  // raw {N}, {X}, {specialism} tokens and tries to invent values for them.
  // Also strip any primaryDataHook line that still contains unfilled templates.
  let cleanedPrompt = userPrompt
    .replace(/Primary data hook[^\n]*\{[NXa-z]+\}[^\n]*/gi, '')
    .replace(/\{N\}/g, '[number]')
    .replace(/\{X\}/g, '[amount]')
    .replace(/\{[a-z_-]+\}/gi, '[detail]');

  const priorRejection = await latestRejectionReason(vendorId).catch(() => null);
  if (priorRejection) {
    cleanedPrompt += `\n\n## PRIOR REJECTION — a previous draft for this firm was rejected:\n${priorRejection}\nDo not repeat those mistakes.`;
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const earlyJurisdiction = resolveJurisdiction(firmContext?._rawFirmForGate || {}).regime?.country || null;
  const jurisdictionRules = buildJurisdictionRulesBlock(vendor.vendorType, earlyJurisdiction);
  const writerSystemPrompt = `${SYSTEM_PROMPT_WRITER_V1_1}\n\nCURRENT_YEAR: ${new Date().getFullYear()}\n\n${ORG_NAME_BAN}\n\n${jurisdictionRules ? jurisdictionRules + '\n\n' : ''}${firmContextBlock}`;

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.7,
      system: writerSystemPrompt,
      messages: [{ role: 'user', content: cleanedPrompt }],
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

  // V1.1 fields from agent output
  const agentReportedPlaceholderCount = typeof parsed.placeholderCount === 'number'
    ? parsed.placeholderCount
    : null;
  const topicSuitabilityFlag = ['ok', 'thin_data', 'unsuitable'].includes(parsed.topicSuitabilityFlag)
    ? parsed.topicSuitabilityFlag
    : 'ok';

  // Independent placeholder count — don't trust agent's self-report blindly
  const verifiedPlaceholderCount =
    countPlaceholders(parsed.body || '') +
    countPlaceholders(parsed.linkedInText || '') +
    countPlaceholders(parsed.facebookText || '');

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  let costEstimateUSD = (inputTokens / 1_000_000 * SONNET_INPUT_COST_PER_M) +
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

  if (topicSuitabilityFlag === 'unsuitable') {
    const summary = `Topic "${parsed.title}" flagged unsuitable for ${vendor.company} (${verifiedPlaceholderCount} placeholders required). No approval created.`;
    await completeRun(agentRun._id, {
      summary,
      artifacts: {
        pillarId: next.pillarId,
        topicIndex: next.topicIndex,
        lastPillar: next.pillarId,
        lastTopicIndex: next.topicIndex,
        postsDrafted: 0,
        skippedReason: 'topic_unsuitable',
        topicSuitabilityFlag,
        placeholderCount: verifiedPlaceholderCount,
        agentReportedPlaceholderCount,
        draftTitle: parsed.title,
        costEstimateUSD,
        inputTokens,
        outputTokens,
        model: MODEL,
      },
      metricsAfter: { writerAgentMonthlyCostUSD: projectedTotal },
    });
    console.log(`${logPrefix} ${vendor.company}: topic "${parsed.title}" UNSUITABLE — no approval created`);
    return {
      success: true,
      skipped: true,
      reason: 'topic_unsuitable',
      agentRunId: agentRun._id,
      costEstimateUSD,
      vendorId: String(vendorId),
      ...(dryRun ? { dryRun: true } : {}),
    };
  }

  // ── Checkpoint 1: Fabrication detection + repair loop ──

  let draftBody = parsed.body || '';
  let draftLinkedIn = parsed.linkedInText || '';
  let draftFacebook = parsed.facebookText || '';
  let repaired = false;
  let repairedViolations = null;
  // No repair cost — repair is deterministic deletion, no LLM call

  const allDraftText = () => [draftBody, draftLinkedIn, draftFacebook].join('\n\n');

  function collectViolations() {
    const regexFlags = detectPossibleFabrication(draftBody);
    return { regexFlags };
  }

  async function runLlmReview() {
    try {
      return await reviewDraftForFabrication({
        draftText: allDraftText(),
        firmContext: firmContextBlock,
        vertical: vendor.vendorType,
      });
    } catch (err) {
      console.error(`${logPrefix} Fabrication review threw for ${vendor.company}:`, err.message);
      return { verdict: 'fail', error: err.message, fabricatedAttributions: [], firmClaimsNotInContext: [], qualityScore: 0 };
    }
  }

  function buildViolationList(regexFlags, llmReview) {
    const items = [];
    for (const f of regexFlags) {
      items.push(`[regex] ${f.body}: "${f.excerpt.substring(0, 120)}"`);
    }
    for (const a of (llmReview.fabricatedAttributions || [])) {
      items.push(`[llm-attribution] ${a.body || 'anonymous'}: "${(a.claim || '').substring(0, 120)}"`);
    }
    for (const c of (llmReview.firmClaimsNotInContext || [])) {
      items.push(`[llm-firm-claim] "${(c.claim || '').substring(0, 120)}"`);
    }
    return items;
  }

  // First pass
  let { regexFlags } = collectViolations();
  let llmReview = regexFlags.length > 0
    ? { verdict: 'fail', fabricatedAttributions: [], firmClaimsNotInContext: [], qualityScore: 0 }
    : await runLlmReview();

  const firstPassBlocked = regexFlags.length > 0 || llmReview.verdict === 'fail';
  const firstPassViolations = firstPassBlocked ? buildViolationList(regexFlags, llmReview) : [];

  // Repair attempt (max 1) — deterministic sentence deletion, no LLM call
  const deletedSentences = [];
  if (firstPassBlocked && firstPassViolations.length > 0 && !llmReview.error) {
    console.log(`${logPrefix} ${vendor.company}: ${firstPassViolations.length} violation(s) detected — attempting deterministic repair`);

    // Extract quoted excerpts from violation strings
    const excerpts = firstPassViolations
      .map(v => {
        const m = v.match(/"([^"]{10,})"/);
        return m ? m[1] : null;
      })
      .filter(Boolean);

    for (const excerpt of excerpts) {
      let found = false;
      for (const field of ['body', 'linkedIn', 'facebook']) {
        const src = field === 'body' ? draftBody : field === 'linkedIn' ? draftLinkedIn : draftFacebook;
        if (!src) continue;

        const located = locateExcerptInText(src, excerpt);
        if (located && located.length > 5) {
          if (/\[FIRM_DATA:|\[FIRM TO PROVIDE:/i.test(located)) {
            console.log(`${logPrefix} Skipped deletion of placeholder sentence: "${located.substring(0, 80)}..."`);
            found = true;
            break;
          }
          const updated = src.replace(located, '');
          if (field === 'body') draftBody = updated;
          else if (field === 'linkedIn') draftLinkedIn = updated;
          else draftFacebook = updated;
          deletedSentences.push(located.substring(0, 200));
          found = true;
          break;
        }
      }
      if (!found) {
        console.warn(`${logPrefix} Could not locate excerpt for deletion: "${excerpt.substring(0, 60)}..."`);
      }
    }

    // Tidy: collapse double whitespace, blank lines, empty headings/list items
    const tidy = (text) => text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^#{1,6}\s*\n/gm, '')
      .replace(/^[-*]\s*\n/gm, '')
      .replace(/  +/g, ' ')
      .trim();

    draftBody = tidy(draftBody);
    draftLinkedIn = tidy(draftLinkedIn);
    draftFacebook = tidy(draftFacebook);

    if (deletedSentences.length > 0) {
      console.log(`${logPrefix} ${vendor.company}: deleted ${deletedSentences.length} sentence(s) — re-checking`);

      // Re-check repaired draft
      const repair2 = collectViolations();
      const llmReview2 = repair2.regexFlags.length > 0
        ? { verdict: 'fail', fabricatedAttributions: [], firmClaimsNotInContext: [], qualityScore: 0 }
        : await runLlmReview();

      if (repair2.regexFlags.length === 0 && llmReview2.verdict === 'pass') {
        repaired = true;
        repairedViolations = firstPassViolations;
        regexFlags = repair2.regexFlags;
        llmReview = llmReview2;
        console.log(`${logPrefix} ${vendor.company}: repair succeeded — ${deletedSentences.length} sentence(s) removed`);
      } else {
        regexFlags = repair2.regexFlags;
        llmReview = llmReview2;
        console.log(`${logPrefix} ${vendor.company}: repair failed — still ${buildViolationList(repair2.regexFlags, llmReview2).length} violation(s) after deletion`);
      }
    }
  }

  // Final decision
  const finalRegexBlocked = regexFlags.length > 0;
  const finalLlmBlocked = llmReview.verdict === 'fail';

  if (finalRegexBlocked) {
    const reasons = regexFlags.map(f => `${f.body}: "${f.excerpt.substring(0, 80)}"`).join('; ');
    const summary = `Draft "${parsed.title}" BLOCKED — regex detected ${regexFlags.length} fabricated attribution(s)${repaired === false && repairedViolations === null ? '' : ' (after repair attempt)'}: ${reasons}`;
    await completeRun(agentRun._id, {
      summary,
      artifacts: {
        pillarId: next.pillarId, topicIndex: next.topicIndex,
        lastPillar: next.pillarId, lastTopicIndex: next.topicIndex,
        postsDrafted: 0, blockedReason: 'regex_fabrication_detected',
        fabricationFlags: regexFlags, costEstimateUSD, model: MODEL,
        firstPassViolations: firstPassViolations.length > 0 ? firstPassViolations : undefined,
      },
      metricsAfter: { writerAgentMonthlyCostUSD: platformCostSoFar + costEstimateUSD },
    });
    console.log(`${logPrefix} ${vendor.company}: ${summary}`);
    return { success: false, blocked: true, reason: 'regex_fabrication_detected', vendorId: String(vendorId), costEstimateUSD };
  }

  if (finalLlmBlocked) {
    const attrCount = (llmReview.fabricatedAttributions || []).length;
    const firmCount = (llmReview.firmClaimsNotInContext || []).length;
    const reasons = buildViolationList([], llmReview).join('; ');
    const reviewNote = llmReview.error
      ? `LLM review error (fail-closed): ${llmReview.error}`
      : `LLM review failed: ${attrCount} fabricated attribution(s), ${firmCount} unverified firm claim(s), quality ${llmReview.qualityScore}/10`;
    const summary = `Draft "${parsed.title}" BLOCKED — ${reviewNote}${repaired === false && repairedViolations === null ? '' : ' (after repair attempt)'}${reasons ? '. ' + reasons : ''}`;
    await completeRun(agentRun._id, {
      summary,
      artifacts: {
        pillarId: next.pillarId, topicIndex: next.topicIndex,
        lastPillar: next.pillarId, lastTopicIndex: next.topicIndex,
        postsDrafted: 0, blockedReason: 'llm_fabrication_review_failed',
        fabricationReview: llmReview, costEstimateUSD, model: MODEL,
        firstPassViolations: firstPassViolations.length > 0 ? firstPassViolations : undefined,
      },
      metricsAfter: { writerAgentMonthlyCostUSD: platformCostSoFar + costEstimateUSD },
    });
    console.log(`${logPrefix} ${vendor.company}: ${summary}`);
    return { success: false, blocked: true, reason: 'llm_fabrication_review_failed', vendorId: String(vendorId), costEstimateUSD };
  }

  const fabricationReview = llmReview;

  // ── Jurisdiction + regulatory gate (deterministic, runs alongside fabrication guards) ──

  const firmForGate = firmContext?._rawFirmForGate || {};
  let gate = validateDraft(draftBody, firmForGate);

  if (!gate.ok) {
    const corrections = gate.blocks.map(b => `- ${b.message}`).join('\n');
    console.log(`${logPrefix} ${vendor.company}: jurisdiction gate failed (${gate.blocks.map(b => b.code).join(',')}), attempting corrective retry`);
    try {
      const retryUserPrompt = `${cleanedPrompt}\n\n## CORRECTIONS — a previous attempt was rejected for:\n${corrections}\nRewrite the article fixing these. Do not reintroduce them.`;
      const retryResp = await anthropic.messages.create({
        model: MODEL, max_tokens: 4000, temperature: 0.7,
        system: writerSystemPrompt,
        messages: [{ role: 'user', content: retryUserPrompt }],
      });
      const retryText = retryResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const retryObj = extractFirstJsonObject(retryText);
      if (retryObj) {
        const retryParsed = JSON.parse(retryObj);
        draftBody = retryParsed.body || draftBody;
      } else {
        console.warn(`${logPrefix} ${vendor.company}: gate retry returned no parseable JSON, keeping prior draft`);
      }
      gate = validateDraft(draftBody, firmForGate);
    } catch (retryErr) {
      console.error(`${logPrefix} ${vendor.company}: corrective retry failed:`, retryErr.message);
    }
  }

  if (!gate.ok) {
    const rejectReason = '[auto-gate] ' + gate.blocks.map(b => `${b.code}: ${b.message}`).join(' | ');
    const rejectedApproval = await createApproval({
      vendorId, agentName: 'writer', itemType: 'content_draft',
      title: `Draft: ${parsed.title}`,
      draftPayload: { title: parsed.title, body: draftBody, linkedInText: draftLinkedIn, facebookText: draftFacebook },
      metadata: { agentRunId: agentRun._id, costEstimateUSD, model: MODEL },
      source: 'auto_gate',
    });
    rejectedApproval.status = 'rejected';
    rejectedApproval.decidedAt = new Date();
    rejectedApproval.decisionReason = rejectReason;
    await rejectedApproval.save();

    await completeRun(agentRun._id, {
      summary: `Draft "${parsed.title}" AUTO-REJECTED: ${gate.blocks.map(b => b.code).join(', ')}`,
      artifacts: { pillarId: next.pillarId, topicIndex: next.topicIndex, lastPillar: next.pillarId, lastTopicIndex: next.topicIndex, postsDrafted: 0, blockedReason: 'auto_gate', gateViolations: gate.blocks, costEstimateUSD, model: MODEL },
      metricsAfter: { writerAgentMonthlyCostUSD: platformCostSoFar + costEstimateUSD },
    });
    console.warn(`${logPrefix} Draft auto-rejected after retry for vendor ${vendorId}: ${gate.blocks.map(b => b.code).join(',')}`);
    return { autoRejected: true, vendorId: String(vendorId), violations: gate.blocks };
  }

  // ── Layer 2: source-verifying claim check ──

  const firmJurisdiction = earlyJurisdiction || 'the UK';
  const firmRegulator = profileFor(vendor.vendorType)?.regulatorFull || null;

  let claimVerification = { status: 'not_run', issues: [], meta: {} };
  const MAX_CLAIM_REWRITES = 3;

  for (let claimPass = 0; claimPass < MAX_CLAIM_REWRITES; claimPass++) {
    const currentCost = await getPlatformCostThisMonth();
    if (currentCost + costEstimateUSD > MONTHLY_COST_CAP_USD) {
      console.log(`${logPrefix} ${vendor.company}: cost cap would be exceeded, skipping claim verification`);
      claimVerification = { status: 'not_run', issues: [], meta: { guard: 'legal-review', error: 'cost_cap_exceeded' } };
      break;
    }

    claimVerification = await verifyClaims({
      draftText: draftBody,
      vertical: vendor.vendorType,
      jurisdiction: firmJurisdiction,
      regulator: firmRegulator,
      firmFacts: firmContextBlock,
    });

    if (claimVerification.status === 'pass') break;
    if (claimVerification.status === 'not_run' || claimVerification.status === 'error') break;

    const failedIssues = claimVerification.issues || [];
    if (failedIssues.length === 0) break;

    console.log(`${logPrefix} ${vendor.company}: legal check failed (pass ${claimPass + 1}/${MAX_CLAIM_REWRITES}), applying surgical repairs`);

    const { repaired, unresolved } = applyRepairs(draftBody, failedIssues);
    draftBody = repaired;

    if (unresolved.length > 0) {
      console.log(`${logPrefix} ${vendor.company}: ${unresolved.length} issue(s) could not be surgically repaired, attempting targeted LLM rewrite`);
      try {
        const unresolvedInstructions = unresolved.map(i => `- Replace: "${i.sentence}" → With: "${i.repair || '(remove this sentence entirely)'}"`).join('\n');
        const targetedResp = await anthropic.messages.create({
          model: MODEL, max_tokens: 4000, temperature: 0,
          system: 'You are an editor. You will receive an article and a list of specific sentences to replace. Replace ONLY those sentences with the provided replacements. Output every other sentence byte-for-byte unchanged. Return the full article as JSON: { "body": "..." }',
          messages: [{ role: 'user', content: `ARTICLE:\n${draftBody}\n\nREPLACEMENTS:\n${unresolvedInstructions}` }],
        });
        const targetedText = targetedResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const targetedObj = extractFirstJsonObject(targetedText);
        if (targetedObj) {
          const targetedParsed = JSON.parse(targetedObj);
          let rewrittenBody = targetedParsed.body || draftBody;

          for (const issue of unresolved) {
            if (!issue.sentence || !issue.repair) continue;
            const survivor = findSentenceInDraft(rewrittenBody, issue.sentence);
            if (survivor && rewrittenBody.includes(issue.repair)) {
              console.log(`${logPrefix} ${vendor.company}: post-rewrite cleanup — removing duplicate original: "${survivor.substring(0, 80)}..."`);
              rewrittenBody = replaceAllOccurrences(rewrittenBody, survivor, '', issue);
            }
          }

          rewrittenBody = rewrittenBody.replace(/\n{3,}/g, '\n\n').replace(/  +/g, ' ').trim();
          draftBody = rewrittenBody;
        }
      } catch (targetedErr) {
        console.error(`${logPrefix} ${vendor.company}: targeted rewrite failed:`, targetedErr.message);
      }
    }

    gate = validateDraft(draftBody, firmForGate);
    if (!gate.ok) {
      console.log(`${logPrefix} ${vendor.company}: repair introduced gate violation (${gate.blocks.map(b => b.code).join(',')}), continuing loop`);
      continue;
    }
  }

  if (claimVerification.status !== 'pass') {
    const failed = claimVerification.issues || [];
    const isInfraError = claimVerification.status === 'not_run' || claimVerification.status === 'error';
    const reason = isInfraError
      ? `Legal verification did not complete (${claimVerification.status}${claimVerification.meta?.error ? ': ' + claimVerification.meta.error : ''}). Draft is NOT verified and cannot be auto-approved.`
      : buildClaimFailureReport(failed, vendor.company);

    const suggestedFixes = (!isInfraError && failed.length > 0)
      ? failed.map(i => ({ sentence: i.sentence, reason: i.reason, repair: i.repair, officialSource: i.officialSource, severity: i.severity }))
      : undefined;

    const legalApproval = await createApproval({
      vendorId, agentName: 'writer', itemType: 'content_draft',
      title: `Draft: ${parsed.title}`,
      draftPayload: { title: parsed.title, body: draftBody, linkedInText: draftLinkedIn, facebookText: draftFacebook },
      metadata: { agentRunId: agentRun._id, costEstimateUSD, model: MODEL, claimVerification, ...(suggestedFixes ? { suggestedFixes } : {}) },
      source: 'legal_check',
    });

    legalApproval.status = 'needs_review';
    legalApproval.decisionReason = reason;
    await legalApproval.save();

    await completeRun(agentRun._id, {
      summary: `Draft "${parsed.title}" NEEDS REVIEW by legal check (${claimVerification.status}): ${failed.length} issue(s)`,
      artifacts: { pillarId: next.pillarId, topicIndex: next.topicIndex, lastPillar: next.pillarId, lastTopicIndex: next.topicIndex, postsDrafted: 0, blockedReason: 'legal_check_' + claimVerification.status, claimVerification, costEstimateUSD, model: MODEL },
      metricsAfter: { writerAgentMonthlyCostUSD: platformCostSoFar + costEstimateUSD },
    });
    console.warn(`${logPrefix} Draft needs review by legal check for vendor ${vendorId}: ${claimVerification.status}`);
    return { success: false, blocked: true, reason: 'legal_check_' + claimVerification.status, needsReview: true, vendorId: String(vendorId), costEstimateUSD };
  }

  // ── All checks passed — create approval ──

  const approval = await createApproval({
    vendorId,
    agentName: 'writer',
    itemType: 'content_draft',
    title: `Draft: ${parsed.title}`,
    draftPayload: {
      title: parsed.title,
      body: draftBody,
      linkedInText: draftLinkedIn,
      facebookText: draftFacebook,
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
      placeholderCount: verifiedPlaceholderCount,
      topicSuitabilityFlag,
      dataGaps: dataGaps.length > 0 ? dataGaps : [],
    },
    metadata: {
      agentRunId: agentRun._id,
      pillarId: next.pillarId,
      topicIndex: next.topicIndex,
      costEstimateUSD,
      inputTokens,
      outputTokens,
      model: MODEL,
      placeholderCount: verifiedPlaceholderCount,
      topicSuitabilityFlag,
      agentReportedPlaceholderCount,
      qualityScore: fabricationReview.qualityScore,
      dataGaps: dataGaps.length > 0 ? dataGaps : undefined,
      ...(repaired ? { repaired: true, repairedViolations, deletedSentences } : {}),
      ...(gate.warnings.length ? { gateWarnings: gate.warnings.map(w => w.code) } : {}),
      ...(dryRun ? { dryRun: true } : {}),
      claimVerification: claimVerification.status !== 'pass' ? claimVerification : undefined,
    },
    source: 'writer-agent-cron',
  });

  const summary = `Drafted "${parsed.title}" for ${next.pillarId} pillar (topic ${next.topicIndex}). Quality ${fabricationReview.qualityScore}/10.${repaired ? ' Repaired.' : ''} Approval pending. Cost $${costEstimateUSD.toFixed(4)}.`;

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
      placeholderCount: verifiedPlaceholderCount,
      topicSuitabilityFlag,
      agentReportedPlaceholderCount,
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

function normaliseForMatch(s) {
  return (s || '').trim()
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!?;:,]+$/, '');
}

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"'\[\(])/).filter(s => s.trim().length > 5);
}

function findSentenceInDraft(draft, issueSentence) {
  if (draft.includes(issueSentence)) return issueSentence;

  const normIssue = normaliseForMatch(issueSentence);
  const sentences = splitSentences(draft);

  for (const sent of sentences) {
    if (normaliseForMatch(sent) === normIssue) return sent;
  }

  for (const sent of sentences) {
    const normSent = normaliseForMatch(sent);
    if (normSent.includes(normIssue) || normIssue.includes(normSent)) return sent;
  }

  const words = issueSentence.split(/\s+/).filter(w => w.length > 3);
  const anchors = [];
  for (let i = 0; i <= words.length - 4; i++) {
    anchors.push(words.slice(i, i + 4).join(' '));
  }
  const rareTokens = words.filter(w => w.length > 5 && /[A-Z]{2,}|[a-z]{6,}/.test(w));

  for (const sent of sentences) {
    const normSent = normaliseForMatch(sent);
    for (const anchor of anchors) {
      if (normSent.includes(normaliseForMatch(anchor))) return sent;
    }
    for (const token of rareTokens) {
      if (normSent.includes(token.toLowerCase())) return sent;
    }
  }

  return null;
}

function extractDistinctiveTokens(sentence) {
  return (sentence || '').split(/\s+/).filter(w => w.length > 4 && /[A-Z]{2,}/.test(w));
}

function replaceAllOccurrences(body, located, replacement, issue) {
  let result = body.replace(located, replacement);
  const wrongTokens = extractDistinctiveTokens(issue.sentence).filter(t => !extractDistinctiveTokens(issue.repair || '').includes(t));
  if (wrongTokens.length > 0 && issue.repair) {
    const repairTokens = extractDistinctiveTokens(issue.repair);
    const sentences = splitSentences(result);
    for (const sent of sentences) {
      const hasWrong = wrongTokens.some(t => sent.includes(t));
      const alreadyFixed = repairTokens.some(t => sent.includes(t));
      if (hasWrong && !alreadyFixed) {
        for (const wt of wrongTokens) {
          const correctToken = repairTokens.find(rt => rt.length >= wt.length - 2 && rt.length <= wt.length + 2);
          if (correctToken && sent.includes(wt)) {
            result = result.replace(sent, sent.replace(new RegExp(wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correctToken));
          }
        }
      }
    }
  }
  return result;
}

function countExactOccurrences(text, needle) {
  let count = 0, idx = 0;
  while ((idx = text.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function wordOverlap(a, b) {
  const wa = new Set(normaliseForMatch(a).split(/\s+/).filter(w => w.length > 2));
  const wb = new Set(normaliseForMatch(b).split(/\s+/).filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

function applyRepairs(body, issues) {
  let repaired = body;
  const unresolved = [];

  for (const issue of issues) {
    if (!issue.sentence) { unresolved.push(issue); continue; }

    const located = findSentenceInDraft(repaired, issue.sentence);
    if (!located) { unresolved.push(issue); continue; }

    if (wordOverlap(located, issue.sentence) < 0.5) {
      console.warn(`[applyRepairs] Skipped low-overlap match: issue="${issue.sentence.substring(0, 50)}..." located="${located.substring(0, 50)}..."`);
      unresolved.push(issue);
      continue;
    }

    const occurrences = countExactOccurrences(repaired, located);
    if (occurrences !== 1) {
      console.warn(`[applyRepairs] Skipped "${located.substring(0, 60)}..." — found ${occurrences} occurrences (need exactly 1)`);
      unresolved.push(issue);
      continue;
    }

    if (issue.verdict === 'firm-unverified' && (!issue.repair || issue.repair.toLowerCase().includes('remove'))) {
      repaired = repaired.replace(located, '');
    } else if (issue.repair) {
      repaired = repaired.replace(located, issue.repair);
    } else {
      unresolved.push(issue);
      continue;
    }
  }

  repaired = repaired
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .replace(/(?:^|\.\s+)[a-z][a-z]{0,15}\s*\.(?=\s|$)/gm, '.')
    .replace(/\.\s*\./g, '.')
    .trim();
  return { repaired, unresolved };
}

function locateExcerptInText(text, excerpt) {
  if (text.includes(excerpt)) {
    const idx = text.indexOf(excerpt);
    const before = text.lastIndexOf('.', idx);
    const sentStart = before === -1 ? 0 : before + 1;
    const after = text.indexOf('.', idx + excerpt.length - 1);
    const sentEnd = after === -1 ? text.length : after + 1;
    const full = text.slice(sentStart, sentEnd).trim();
    return full.length > excerpt.length / 2 ? full : excerpt;
  }
  const sent = findSentenceInDraft(text, excerpt);
  return sent;
}

function buildClaimFailureReport(issues, firmName) {
  const lines = [`Legal review failed for ${firmName}. ${issues.length} issue(s) found:\n`];
  issues.forEach((issue, i) => {
    lines.push(`${i + 1}. [${issue.severity.toUpperCase()}] "${issue.sentence}"`);
    lines.push(`   Reason: ${issue.reason}`);
    if (issue.repair) lines.push(`   Fix: ${issue.repair}`);
    if (issue.officialSource) lines.push(`   Source: ${issue.officialSource}`);
    lines.push('');
  });
  lines.push('Next actions: fix the issues above and regenerate, or manually verify each claim before approving.');
  return lines.join('\n');
}

export { resolveNextTopic, isProTier, MONTHLY_COST_CAP_USD, MONTHLY_PER_VENDOR_CAP, SONNET_INPUT_COST_PER_M, SONNET_OUTPUT_COST_PER_M, ORG_NAME_BAN, applyRepairs, buildClaimFailureReport };
