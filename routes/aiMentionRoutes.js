import express from 'express';
import mongoose from 'mongoose';
import vendorAuth from '../middleware/vendorAuth.js';
import AIMentionScan from '../models/AIMentionScan.js';
import Vendor from '../models/Vendor.js';

const router = express.Router();

const PAID_TIERS = ['basic', 'visible', 'managed', 'enterprise', 'verified'];

function isPaidTier(vendor) {
  const tier = (vendor.tier || 'free').toLowerCase();
  return PAID_TIERS.includes(tier);
}

/**
 * GET /api/ai-mentions/summary
 * Returns AI mention summary for the authenticated vendor
 */
router.get('/summary', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const vendor = await Vendor.findById(vendorId).select('tier').lean();
    const paid = vendor && isPaidTier(vendor);

    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay()); // Start of this week (Sunday)
    thisWeekStart.setHours(0, 0, 0, 0);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // All-time mentions count
    const [totalMentions, thisWeekData, lastWeekData] = await Promise.all([
      AIMentionScan.countDocuments({ vendorId, mentioned: true }),
      AIMentionScan.countDocuments({
        vendorId,
        mentioned: true,
        scanDate: { $gte: thisWeekStart },
      }),
      AIMentionScan.countDocuments({
        vendorId,
        mentioned: true,
        scanDate: { $gte: lastWeekStart, $lt: thisWeekStart },
      }),
    ]);

    // Trend
    let trend = 'stable';
    if (thisWeekData > lastWeekData) trend = 'up';
    else if (thisWeekData < lastWeekData) trend = 'down';

    // Base response (free tier)
    const response = {
      totalMentions,
      mentionsThisWeek: thisWeekData,
      mentionsLastWeek: lastWeekData,
      trend,
    };

    // Paid tier gets full data
    if (paid) {
      // Mention rate (last 30 days)
      const [totalPrompts, mentionedPrompts] = await Promise.all([
        AIMentionScan.countDocuments({ vendorId, scanDate: { $gte: thirtyDaysAgo } }),
        AIMentionScan.countDocuments({
          vendorId,
          mentioned: true,
          scanDate: { $gte: thirtyDaysAgo },
        }),
      ]);
      response.mentionRate = totalPrompts > 0
        ? Math.round((mentionedPrompts / totalPrompts) * 100)
        : 0;

      // Latest mentions (last 10 where mentioned=true)
      response.latestMentions = await AIMentionScan.find({
        vendorId,
        mentioned: true,
      })
        .sort({ scanDate: -1 })
        .limit(10)
        .select('scanDate prompt position competitorsMentioned category location')
        .lean();

      // Weekly history (last 12 weeks)
      const twelveWeeksAgo = new Date(now);
      twelveWeeksAgo.setDate(now.getDate() - 84);

      const weeklyAgg = await AIMentionScan.aggregate([
        {
          $match: {
            vendorId: new mongoose.Types.ObjectId(vendorId),
            mentioned: true,
            scanDate: { $gte: twelveWeeksAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%G-W%V', date: '$scanDate' },
            },
            mentions: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      response.weeklyHistory = weeklyAgg.map((w) => ({
        week: w._id,
        mentions: w.mentions,
      }));
    }

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('AI mentions summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch AI mention data' });
  }
});

/**
 * GET /api/ai-mentions/competitors
 * Returns competitor analysis for the authenticated vendor
 */
router.get('/competitors', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const vendor = await Vendor.findById(vendorId).select('tier company services location').lean();

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const paid = isPaidTier(vendor);

    if (!paid) {
      // Count unique competitors without revealing names
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const competitorAgg = await AIMentionScan.aggregate([
        {
          $match: {
            vendorId: new mongoose.Types.ObjectId(vendorId),
            scanDate: { $gte: thirtyDaysAgo },
          },
        },
        { $unwind: '$competitorsMentioned' },
        { $group: { _id: '$competitorsMentioned' } },
        { $count: 'total' },
      ]);

      return res.json({
        success: true,
        data: {
          locked: true,
          competitorCount: competitorAgg[0]?.total || 0,
          message: "Upgrade to see who's outranking you in AI search",
        },
      });
    }

    // Paid tier — full competitor data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Top competitors
    const topCompetitors = await AIMentionScan.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          scanDate: { $gte: thirtyDaysAgo },
        },
      },
      { $unwind: '$competitorsMentioned' },
      {
        $group: {
          _id: '$competitorsMentioned',
          mentionCount: { $sum: 1 },
        },
      },
      { $sort: { mentionCount: -1 } },
      { $limit: 10 },
      {
        $project: {
          name: '$_id',
          mentionCount: 1,
          _id: 0,
        },
      },
    ]);

    // Vendor's own rank: how many vendors in same category+location are mentioned more
    const category = vendor.services?.[0] || '';
    const location = vendor.location?.city || '';

    let vendorRank = null;
    if (category && location) {
      // Count mentions for all vendors in the same category+location in last 30 days
      const allVendorMentions = await AIMentionScan.aggregate([
        {
          $match: {
            category,
            location: { $regex: new RegExp(location, 'i') },
            mentioned: true,
            scanDate: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: '$vendorId',
            mentionCount: { $sum: 1 },
          },
        },
        { $sort: { mentionCount: -1 } },
      ]);

      const vendorIdStr = vendorId.toString();
      const rank = allVendorMentions.findIndex(
        (v) => v._id.toString() === vendorIdStr
      );
      vendorRank = rank >= 0 ? rank + 1 : allVendorMentions.length + 1;
    }

    res.json({
      success: true,
      data: {
        topCompetitors,
        vendorRank,
        totalVendorsInArea: null, // Could be enhanced later
      },
    });
  } catch (error) {
    console.error('AI mentions competitors error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch competitor data' });
  }
});

export default router;
