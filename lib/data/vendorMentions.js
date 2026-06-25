import mongoose from 'mongoose';
import AIMentionScan from '../../models/AIMentionScan.js';
import { BROWSING_PLATFORMS } from '../config/browsingPlatforms.js';

function browsingFilter(extra = {}) {
  return { aiModel: { $in: BROWSING_PLATFORMS }, ...extra };
}

export async function countMentions({ vendorId, since, mentionedOnly = true } = {}) {
  const filter = browsingFilter();
  if (vendorId) filter.vendorId = vendorId;
  if (mentionedOnly) filter.mentioned = true;
  if (since) filter.scanDate = { $gte: since };
  return AIMentionScan.countDocuments(filter);
}

export async function getMentionData(vendorId) {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const base = { vendorId, mentioned: true, ...browsingFilter() };

  const [mentionsThisWeek, mentionsLastWeek, totalMentions30d, positionAgg] = await Promise.all([
    AIMentionScan.countDocuments({ ...base, scanDate: { $gte: thisWeekStart } }).catch(() => 0),
    AIMentionScan.countDocuments({ ...base, scanDate: { $gte: lastWeekStart, $lt: thisWeekStart } }).catch(() => 0),
    AIMentionScan.countDocuments({ ...base, scanDate: { $gte: thirtyDaysAgo } }).catch(() => 0),
    AIMentionScan.aggregate([
      { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), mentioned: true, ...browsingFilter(), scanDate: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, positions: { $push: '$position' } } },
    ]).catch(() => []),
  ]);

  let avgPosition = null;
  if (positionAgg.length > 0) {
    const positions = positionAgg[0].positions;
    const firstCount = positions.filter(p => p === 'first').length;
    const top3Count = positions.filter(p => p === 'top3').length;
    if (firstCount > positions.length / 2) avgPosition = 'first';
    else if ((firstCount + top3Count) > positions.length / 2) avgPosition = 'top3';
    else avgPosition = 'mentioned';
  }

  return { mentionsThisWeek, mentionsLastWeek, totalMentions30d, avgPosition };
}

export async function getMentionDocs({ vendorId, since, limit = 50 } = {}) {
  const filter = browsingFilter({ mentioned: true });
  if (vendorId) filter.vendorId = vendorId;
  if (since) filter.scanDate = { $gte: since };
  return AIMentionScan.find(filter).sort({ scanDate: -1 }).limit(limit).lean();
}

export async function aggregateByPlatform({ vendorId, since } = {}) {
  const match = browsingFilter({ mentioned: true });
  if (vendorId) match.vendorId = new mongoose.Types.ObjectId(vendorId);
  if (since) match.scanDate = { $gte: since };
  return AIMentionScan.aggregate([
    { $match: match },
    { $group: { _id: { $ifNull: ['$platform', '$aiModel'] }, count: { $sum: 1 } } },
  ]);
}

export async function aggregateByWeek({ vendorId, since } = {}) {
  const match = browsingFilter();
  if (vendorId) match.vendorId = new mongoose.Types.ObjectId(vendorId);
  if (since) match.scanDate = { $gte: since };
  match.$or = [{ status: 'ok' }, { status: { $exists: false } }];
  return AIMentionScan.aggregate([
    { $match: match },
    { $group: {
      _id: { $dateToString: { format: '%Y-%U', date: '$scanDate' } },
      total: { $sum: 1 },
      mentioned: { $sum: { $cond: ['$mentioned', 1, 0] } },
    } },
    { $sort: { _id: 1 } },
  ]);
}

export async function vendorHasRealScans(vendorId) {
  const count = await AIMentionScan.countDocuments({
    vendorId,
    ...browsingFilter(),
    $or: [{ status: 'ok' }, { status: { $exists: false } }],
  });
  return { hasRealScans: count > 0, scanCount: count };
}

export function getBrowsingFilter() {
  return browsingFilter();
}
