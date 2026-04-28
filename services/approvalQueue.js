import ApprovalQueue from '../models/ApprovalQueue.js';

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
  if (item.status !== 'pending') {
    throw new Error(`Cannot approve item with status "${item.status}" — must be "pending"`);
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
  if (item.status !== 'pending') {
    throw new Error(`Cannot reject item with status "${item.status}" — must be "pending"`);
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
    // Publishes or updates a VendorPost from draftPayload when implemented.
    // Expected draftPayload: { title, body, category, tags, linkedInText, facebookText }
    throw new Error('Execution handler for "content_draft" is not yet connected — implement in services/approvalQueue.js');
  },

  async directory_submission(item) {
    // Submits vendor to external directories when implemented.
    // Expected draftPayload: { directoryName, submissionData }
    throw new Error('Execution handler for "directory_submission" is not yet connected — implement in services/approvalQueue.js');
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
  filter.status = status || 'pending';
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
