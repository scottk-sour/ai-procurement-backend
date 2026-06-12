import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import { PILLAR_LIBRARIES, VERTICAL_ENTITIES } from './contentPlanner/pillarLibraries.js';
import { SYSTEM_PROMPT_V7, SYSTEM_PROMPT_WRITER_V1_1, VERTICAL_LABELS } from './contentPlanner/prompts.js';
import { getFirmContext, renderFirmContextBlock } from './contentPlanner/firmContext.js';
import { reviewDraftForFabrication } from './contentPlanner/fabricationReview.js';
import { countAllPlaceholders as countPlaceholders } from './writerAgent/parsePlaceholders.js';
import { buildUserPrompt } from '../routes/vendorPostRoutes.js';
import { findOrCreateRun, startRun, completeRun, failRun } from './agentRun.js';
import { createApproval } from './approvalQueue.js';
import { buildCtaForVendor, detectPossibleFabrication } from './contentPlanner/writerGuards.js';
import { FIRM_DATA_KEYS } from './writerAgent/firmDataKeys.js';

const SONNET_INPUT_COST_PER_M = 3.00;
const SONNET_OUTPUT_COST_PER_M = 15.00;
const MONTHLY_COST_CAP_USD = 75;
// 3 articles/week × ~4.33 weeks = max 14/month. Matches Pro tier promise in tendorai-what-you-get.pdf.
const MONTHLY_PER_VENDOR_CAP = 14;
const MODEL = 'claude-sonnet-4-20250514';

const PRO_TIERS = new Set(['pro', 'managed', 'verified', 'enterprise']);

const ORG_NAME_BAN = `## ABSOLUTE CONSTRAINT — NO STATISTICS WITHOUT DATA

The article body must contain ZERO numeric statistics, percentages, market figures, monetary amounts, or specific timelines UNLESS the exact figure appears verbatim in the firm_context block above.

This includes:
- Named attributions: "Propertymark data shows 40%..." — BLOCKED
- Anonymous attributions: "market data shows...", "analysis indicates...", "sales data suggests...", "Cardiff market analysis shows..." — BLOCKED (anonymous attribution is still fabrication)
- Specific timelines: "8-12 weeks", "15 days faster" — BLOCKED unless in firm_context
- Specific counts: "87 properties", "5 accelerators" — BLOCKED unless in firm_context

With no data in firm_context, write QUALITATIVELY with no numbers:
- GOOD: "Overpriced properties take noticeably longer to sell."
- GOOD: "Most residential transactions complete within a few months."
- GOOD: "Accurately priced homes tend to attract more interest."
- BAD: "Properties sell 40% faster when priced correctly." (invented figure)
- BAD: "Chain complications account for approximately 15% of delays." (invented figure)
- BAD: "Cardiff market analysis shows spring generates more enquiries." (anonymous attribution)

Do NOT emit [FIRM_DATA: ...] or [FIRM TO PROVIDE: ...] placeholder tokens in the article body. If data is missing, write the section qualitatively without it. Missing data keys are tracked separately as metadata — the article must read as a complete, polished piece with no visible gaps.

Organisation names (Land Registry, Propertymark, NAEA, ARLA, RICS, TPO, Rightmove, Zoopla, SRA, ICAEW, FCA, HMRC, ONS, etc.) may be mentioned for qualitative context ("SRA-regulated firm", "Propertymark-registered agent") but NEVER alongside a statistic not in firm_context.

This constraint is enforced by TWO automated detectors after generation. Drafts containing fabricated statistics or placeholder tokens in the body are automatically rejected.`;

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
  const cleanedPrompt = userPrompt
    .replace(/Primary data hook[^\n]*\{[NXa-z]+\}[^\n]*/gi, '')
    .replace(/\{N\}/g, '[number]')
    .replace(/\{X\}/g, '[amount]')
    .replace(/\{[a-z_-]+\}/gi, '[detail]');

  let response;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.7,
      system: `${SYSTEM_PROMPT_WRITER_V1_1}\n\nCURRENT_YEAR: ${new Date().getFullYear()}\n\n${ORG_NAME_BAN}\n\n${firmContextBlock}`,
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
      // Try exact substring match first, then progressively shorter prefixes
      let found = false;
      for (const field of ['body', 'linkedIn', 'facebook']) {
        const src = field === 'body' ? draftBody : field === 'linkedIn' ? draftLinkedIn : draftFacebook;
        if (!src) continue;

        // Find the sentence containing this excerpt
        const idx = src.indexOf(excerpt);
        const fuzzyIdx = idx === -1 && excerpt.length > 30 ? src.indexOf(excerpt.substring(0, 30)) : idx;
        const matchIdx = idx !== -1 ? idx : fuzzyIdx;

        if (matchIdx !== -1) {
          // Find sentence boundaries around the match
          const before = src.lastIndexOf('.', matchIdx);
          const sentStart = before === -1 ? 0 : before + 1;
          const after = src.indexOf('.', matchIdx + 10);
          const sentEnd = after === -1 ? src.length : after + 1;
          const sentence = src.slice(sentStart, sentEnd).trim();

          if (sentence.length > 5) {
            const updated = src.replace(sentence, '');
            if (field === 'body') draftBody = updated;
            else if (field === 'linkedIn') draftLinkedIn = updated;
            else draftFacebook = updated;
            deletedSentences.push(sentence.substring(0, 200));
            found = true;
            break;
          }
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

  // ── Both checks passed — create approval ──

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
      ...(dryRun ? { dryRun: true } : {}),
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

export { resolveNextTopic, isProTier, MONTHLY_COST_CAP_USD, MONTHLY_PER_VENDOR_CAP, SONNET_INPUT_COST_PER_M, SONNET_OUTPUT_COST_PER_M, ORG_NAME_BAN };
