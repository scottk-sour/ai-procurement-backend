import AgentRun from '../models/AgentRun.js';

export async function createRun({ vendorId, agentName, weekStarting, summary, artifacts, metricsBefore }) {
  const week = weekStarting
    ? AgentRun.normaliseWeekStarting(weekStarting)
    : AgentRun.normaliseWeekStarting(new Date());

  const run = new AgentRun({
    vendorId,
    agentName,
    weekStarting: week,
    summary,
    artifacts,
    metricsBefore,
  });
  return run.save();
}

export async function startRun(runId) {
  const run = await AgentRun.findById(runId);
  if (!run) throw new Error('Agent run not found');
  if (run.status !== 'pending') {
    throw new Error(`Cannot start run with status "${run.status}" — must be "pending"`);
  }

  run.status = 'running';
  run.startedAt = new Date();
  return run.save();
}

export async function completeRun(runId, { summary, artifacts, metricsAfter, relatedApprovalIds }) {
  if (!summary) throw new Error('Summary is required to complete a run');
  if (!artifacts) throw new Error('Artifacts are required to complete a run');
  if (!metricsAfter) throw new Error('metricsAfter is required to complete a run');

  const run = await AgentRun.findById(runId);
  if (!run) throw new Error('Agent run not found');
  if (run.status !== 'running') {
    throw new Error(`Cannot complete run with status "${run.status}" — must be "running"`);
  }

  run.status = 'completed';
  run.completedAt = new Date();
  run.summary = summary;
  run.artifacts = artifacts;
  run.metricsAfter = metricsAfter;
  if (relatedApprovalIds) run.relatedApprovalIds = relatedApprovalIds;
  if (run.startedAt) run.durationMs = run.completedAt.getTime() - run.startedAt.getTime();
  return run.save();
}

export async function failRun(runId, { failureReason, partialArtifacts }) {
  if (!failureReason) throw new Error('failureReason is required');

  const run = await AgentRun.findById(runId);
  if (!run) throw new Error('Agent run not found');
  if (run.status !== 'running') {
    throw new Error(`Cannot fail run with status "${run.status}" — must be "running"`);
  }

  run.status = partialArtifacts ? 'partial' : 'failed';
  run.completedAt = new Date();
  run.failureReason = failureReason;
  if (partialArtifacts) run.artifacts = partialArtifacts;
  if (run.startedAt) run.durationMs = run.completedAt.getTime() - run.startedAt.getTime();
  return run.save();
}

export async function getWeeklyRuns(vendorId, weekStarting) {
  const week = AgentRun.normaliseWeekStarting(weekStarting);
  return AgentRun.find({ vendorId, weekStarting: week })
    .sort({ agentName: 1 })
    .populate('relatedApprovalIds', 'title status itemType')
    .lean();
}

export async function getRunsByVendor(vendorId, { limit = 20, page = 1, agentName, status } = {}) {
  const filter = { vendorId };
  if (agentName) filter.agentName = agentName;
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    AgentRun.find(filter)
      .sort({ weekStarting: -1, agentName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AgentRun.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function getCurrentWeekRuns(vendorId) {
  return getWeeklyRuns(vendorId, new Date());
}

export async function findOrCreateRun({ vendorId, agentName, weekStarting }) {
  const week = weekStarting
    ? AgentRun.normaliseWeekStarting(weekStarting)
    : AgentRun.normaliseWeekStarting(new Date());

  const existing = await AgentRun.findOne({ vendorId, agentName, weekStarting: week });
  if (existing) return existing;

  const run = new AgentRun({
    vendorId,
    agentName,
    weekStarting: week,
  });
  return run.save();
}

export async function getRunById(runId) {
  return AgentRun.findById(runId)
    .populate('vendorId', 'company email tier vendorType location.city')
    .populate('relatedApprovalIds', 'title status itemType decidedAt')
    .lean();
}
