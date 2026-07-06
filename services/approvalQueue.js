import ApprovalQueue from '../models/ApprovalQueue.js';
import { validateContentDraft } from './contentPlanner/validators.js';
import { reviewDraftForFabrication } from './contentPlanner/fabricationReview.js';
import { getFirmContext, renderFirmContextBlock } from './contentPlanner/firmContext.js';

export async function createApproval({ vendorId, agentName, itemType, title, draftPayload, metadata, source }) {
  const item = new ApprovalQueue({
    vendorId,
    agentName,
    itemType,
    title,
    draftPayload,
    metadata,
    source,
  });
  return item.save();
}

export async function approveItem(approvalId, adminUserId, reason) {
  const item = await ApprovalQueue.findById(approvalId);
  if (!item) throw new Error('Approval item not found');
  if (!['pending', 'needs_review', 'firm_completed'].includes(item.status)) {
    throw new Error(`Cannot approve item with status "${item.status}" — must be "pending", "needs_review", or "firm_completed"`);
  }

  item.status = 'approved';
  item.decidedAt = new Date();
  item.decidedBy = adminUserId || undefined;
  if (reason) item.decisionReason = reason;
  return item.save();
}

export async function rejectItem(approvalId, adminUserId, reason) {
  if (!reason) throw new Error('Rejection reason is required');

  const item = await ApprovalQueue.findById(approvalId);
  if (!item) throw new Error('Approval item not found');
  if (!['pending', 'needs_review'].includes(item.status)) {
    throw new Error(`Cannot reject item with status "${item.status}" — must be "pending" or "needs_review"`);
  }

  item.status = 'rejected';
  item.decidedAt = new Date();
  item.decidedBy = adminUserId || undefined;
  item.decisionReason = reason;
  return item.save();
}

const executionHandlers = {
  async schema_change(item) {
    // Connects to SchemaInstallRequest service when implemented.
    // Expected draftPayload: { websiteUrl, schemaMarkup, cmsPlatform }
    throw new Error('Execution handler for "schema_change" is not yet connected — implement in services/approvalQueue.js');
  },

  async content_draft(item) {
    const payload = item.draftPayload || {};
    if (!payload.title) throw new Error('draftPayload.title is required to create a VendorPost');
    if (!payload.body) throw new Error('draftPayload.body is required to create a VendorPost');

    // Pre-publish validator — hard block on errors, log warnings.
    const validation = validateContentDraft(payload);
    if (!validation.passed) {
      throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }
    if (validation.warnings.length > 0) {
      console.warn(`[approvalQueue.content_draft] Warnings for approval ${item._id}:`, validation.warnings);
    }

    const { default: Vendor } = await import('../models/Vendor.js');
    const vendor = await Vendor.findById(item.vendorId).lean();
    if (!vendor) throw new Error(`Vendor not found: ${item.vendorId}`);

    // Semantic firm-performance-claim check (Haiku) — replaces the deterministic
    // regex which false-positived on generic process descriptions and markdown.
    // Fail-closed: API error or timeout blocks publish.
    const allText = [payload.body, payload.linkedInText || '', payload.facebookText || ''].join('\n\n');
    let firmContextBlock;
    try {
      const firmContext = await getFirmContext(item.vendorId);
      firmContextBlock = renderFirmContextBlock(firmContext);
    } catch (err) {
      throw new Error(`Cannot load firm context for semantic check: ${err.message}`);
    }

    const semanticReview = await reviewDraftForFabrication({
      draftText: allText,
      firmContext: firmContextBlock,
      vertical: vendor.vendorType,
    });

    if (semanticReview.verdict === 'fail') {
      const claims = [
        ...(semanticReview.fabricatedAttributions || []).map(a => `Fabricated attribution (${a.body}): "${a.claim}"`),
        ...(semanticReview.firmClaimsNotInContext || []).map(c => `Unverified firm claim: "${c.claim}"`),
      ];
      const errorNote = semanticReview.error
        ? `Semantic review error (fail-closed): ${semanticReview.error}`
        : `Semantic review failed (quality ${semanticReview.qualityScore}/10): ${claims.join('; ')}`;
      throw new Error(`Publish blocked — ${errorNote}`);
    }

    const { default: VendorPost } = await import('../models/VendorPost.js');
    const post = new VendorPost({
      vendor: item.vendorId,
      title: payload.title,
      body: payload.body,
      category: payload.category || 'guide',
      tags: payload.tags || [],
      status: 'published',
      aiGenerated: true,
      topic: payload.topic,
      stats: payload.stats,
      linkedInText: payload.linkedInText,
      facebookText: payload.facebookText,
      pillar: payload.pillar,
      plan: payload.plan,
      primaryData: payload.primaryData,
      relatedApprovalId: item._id,
      agentRunId: item.metadata?.agentRunId || undefined,
    });

    await post.save();

    return {
      postId: post._id,
      slug: post.slug,
      vendorId: post.vendor,
      createdAt: post.createdAt,
    };
  },

  async directory_submission(item) {
    const { directoryName, listingId } = item.draftPayload || {};
    if (!listingId) throw new Error('directory_submission missing listingId in draftPayload');

    const { default: DirectoryListing } = await import('../models/DirectoryListing.js');
    const listing = await DirectoryListing.findById(listingId);
    if (!listing) throw new Error(`DirectoryListing ${listingId} not found`);

    listing.status = 'live';
    listing.submittedAt = listing.submittedAt || new Date();
    listing.verifiedAt = new Date();
    await listing.save();

    return { directory: directoryName, listingId: listing._id };
  },

  async review_request_batch(item) {
    // Sends review request emails in batch when implemented.
    // Expected draftPayload: { recipients: [{ email, name }], templateId }
    throw new Error('Execution handler for "review_request_batch" is not yet connected — implement in services/approvalQueue.js');
  },

  async press_release(item) {
    // Distributes press release when implemented.
    // Expected draftPayload: { headline, body, targetOutlets }
    throw new Error('Execution handler for "press_release" is not yet connected — implement in services/approvalQueue.js');
  },

  async outreach_pitch(item) {
    // Sends outreach pitch emails when implemented.
    // Expected draftPayload: { recipientEmail, subject, body }
    throw new Error('Execution handler for "outreach_pitch" is not yet connected — implement in services/approvalQueue.js');
  },

  async other(item) {
    // Generic handler for untyped items — requires manual execution.
    throw new Error('Execution handler for "other" requires a type-specific implementation');
  },
};

export async function editItem(approvalId, adminUserId, { body, title }) {
  const item = await ApprovalQueue.findById(approvalId);
  if (!item) throw new Error('Approval item not found');
  if (!['pending', 'needs_review', 'firm_completed'].includes(item.status)) {
    throw new Error(`Cannot edit item with status "${item.status}" — must be "pending", "needs_review", or "firm_completed"`);
  }

  if (body !== undefined) item.draftPayload.body = body;
  if (title !== undefined) item.draftPayload.title = title;
  item.editedByAdmin = true;
  item.editedAt = new Date();
  item.markModified('draftPayload');
  return item.save();
}

export async function executeApprovedItem(approvalId) {
  const item = await ApprovalQueue.findById(approvalId);
  if (!item) throw new Error('Approval item not found');
  if (item.status !== 'approved') {
    throw new Error(`Cannot execute item with status "${item.status}" — must be "approved"`);
  }

  const handler = executionHandlers[item.itemType];
  if (!handler) {
    throw new Error(`No execution handler registered for itemType "${item.itemType}"`);
  }

  try {
    const result = await handler(item);
    item.status = 'executed';
    item.executedAt = new Date();
    item.executionResult = result;
    return item.save();
  } catch (err) {
    item.status = 'failed';
    item.executedAt = new Date();
    item.executionError = err.message;
    await item.save();
    throw err;
  }
}

export async function listPending({ status, agentName, itemType, vendorId, page = 1, limit = 20 } = {}) {
  const filter = {};
  filter.status = status || { $in: ['pending', 'needs_review'] };
  if (agentName) filter.agentName = agentName;
  if (itemType) filter.itemType = itemType;
  if (vendorId) filter.vendorId = vendorId;

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    ApprovalQueue.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('vendorId', 'company email tier vendorType location.city')
      .populate('decidedBy', 'name email')
      .lean(),
    ApprovalQueue.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function getApprovalById(approvalId) {
  return ApprovalQueue.findById(approvalId)
    .populate('vendorId', 'company email tier vendorType location.city')
    .populate('decidedBy', 'name email')
    .lean();
}

export async function reVerifyItem(approvalId) {
  const item = await ApprovalQueue.findById(approvalId);
  if (!item) throw new Error('Approval item not found');
  if (item.itemType !== 'content_draft') {
    throw new Error('Re-verify is only supported for content_draft items');
  }
  if (!['rejected', 'needs_review'].includes(item.status)) {
    throw new Error(`Cannot re-verify item with status "${item.status}" — must be "rejected" or "needs_review"`);
  }

  const { verifyClaims } = await import('./contentReview/verifyClaims.js');
  const { resolveJurisdiction } = await import('../lib/config/jurisdictions.js');
  const { profileFor } = await import('../lib/config/industryProfiles.js');
  const { extractFirstJsonObject } = await import('./contentReview/jsonExtract.js');
  const { SONNET_MODEL } = await import('../lib/config/models.js');

  const { default: Vendor } = await import('../models/Vendor.js');
  const vendor = await Vendor.findById(item.vendorId).lean();
  if (!vendor) throw new Error(`Vendor not found: ${item.vendorId}`);

  const firmContext = await getFirmContext(item.vendorId);
  const firmContextBlock = renderFirmContextBlock(firmContext);
  const { regime } = resolveJurisdiction(firmContext._rawFirmForGate || {});
  const jurisdiction = regime?.country || 'the UK';
  const regulator = profileFor(vendor.vendorType)?.regulatorFull || null;

  let draftBody = item.draftPayload?.body || '';
  let claimVerification = { status: 'not_run', issues: [], meta: {} };

  const { applyRepairs, buildClaimFailureReport } = await import('./writerAgent.js');

  const MAX_PASSES = 3;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    claimVerification = await verifyClaims({
      draftText: draftBody,
      vertical: vendor.vendorType,
      jurisdiction,
      regulator,
      firmFacts: firmContextBlock,
    });

    if (claimVerification.status === 'pass') break;
    if (claimVerification.status === 'not_run' || claimVerification.status === 'error') break;

    const failedIssues = claimVerification.issues || [];
    if (failedIssues.length === 0) break;

    const { repaired, unresolved } = applyRepairs(draftBody, failedIssues);
    draftBody = repaired;

    if (unresolved.length > 0) {
      try {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const unresolvedInstructions = unresolved.map(i => `- Replace: "${i.sentence}" → With: "${i.repair || '(remove this sentence entirely)'}"`).join('\n');
        const targetedResp = await anthropic.messages.create({
          model: SONNET_MODEL, max_tokens: 4000, temperature: 0,
          system: 'You are an editor. You will receive an article and a list of specific sentences to replace. Replace ONLY those sentences with the provided replacements. Output every other sentence byte-for-byte unchanged. Return the full article as JSON: { "body": "..." }',
          messages: [{ role: 'user', content: `ARTICLE:\n${draftBody}\n\nREPLACEMENTS:\n${unresolvedInstructions}` }],
        });
        const targetedText = targetedResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const targetedObj = extractFirstJsonObject(targetedText);
        if (targetedObj) {
          const targetedParsed = JSON.parse(targetedObj);
          draftBody = targetedParsed.body || draftBody;
        }
      } catch (err) {
        console.error(`[reVerify] Targeted rewrite failed: ${err.message}`);
      }
    }
  }

  item.draftPayload.body = draftBody;
  item.markModified('draftPayload');

  if (claimVerification.status === 'pass') {
    item.status = 'pending';
    item.decisionReason = null;
    if (!item.metadata) item.metadata = {};
    item.metadata.reVerifiedAt = new Date();
    item.metadata.claimVerification = undefined;
    item.metadata.suggestedFixes = undefined;
    item.markModified('metadata');
  } else if (claimVerification.status === 'fail') {
    const failed = claimVerification.issues || [];
    item.status = 'needs_review';
    item.decisionReason = buildClaimFailureReport(failed, vendor.company);
    if (!item.metadata) item.metadata = {};
    item.metadata.suggestedFixes = failed.map(i => ({ sentence: i.sentence, reason: i.reason, repair: i.repair, officialSource: i.officialSource, severity: i.severity }));
    item.metadata.claimVerification = claimVerification;
    item.metadata.reVerifiedAt = new Date();
    item.markModified('metadata');
  } else {
    item.status = 'rejected';
    item.decidedAt = new Date();
    item.decisionReason = `Legal verification did not complete (${claimVerification.status}${claimVerification.meta?.error ? ': ' + claimVerification.meta.error : ''}).`;
    if (!item.metadata) item.metadata = {};
    item.metadata.reVerifiedAt = new Date();
    item.markModified('metadata');
  }

  return item.save();
}

export async function latestRejectionReason(vendorId, itemType = 'content_draft') {
  const last = await ApprovalQueue.findOne({ vendorId, itemType, status: 'rejected' })
    .sort({ decidedAt: -1, createdAt: -1 })
    .select('decisionReason')
    .lean();
  return last?.decisionReason || null;
}
