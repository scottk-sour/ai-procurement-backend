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
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const category = vendor.services?.[0] || '';
      const location = vendor.location?.city || '';

      let competitorCount = 0;
      let topCounts = [];
      let vendorRank = null;
      let vendorMentionCount = 0;

      if (category && location) {
        // Get all vendors in same category+location ranked by mention count
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
        const vendorEntry = allVendorMentions.find(
          (v) => v._id.toString() === vendorIdStr
        );
        vendorMentionCount = vendorEntry?.mentionCount || 0;
        const rank = allVendorMentions.findIndex(
          (v) => v._id.toString() === vendorIdStr
        );
        vendorRank = rank >= 0 ? rank + 1 : allVendorMentions.length + 1;

        // Competitors = other vendors in same space (excluding current)
        const competitors = allVendorMentions.filter(
          (v) => v._id.toString() !== vendorIdStr
        );
        competitorCount = competitors.length;
        topCounts = competitors.slice(0, 3).map((c) => c.mentionCount);
      }

      return res.json({
        success: true,
        data: {
          locked: true,
          competitorCount,
          topCounts,
          vendorRank,
          vendorMentionCount,
          category,
          location,
          message: "Upgrade to see who's outranking you in AI search",
        },
      });
    }

    // Paid tier — full competitor data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const category = vendor.services?.[0] || '';
    const location = vendor.location?.city || '';

    let topCompetitors = [];
    let vendorRank = null;
    let vendorMentionCount = 0;

    if (category && location) {
      // Get all vendors in same category+location ranked by AI mention count
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

      // Find current vendor's rank and mention count
      const vendorIdStr = vendorId.toString();
      const vendorEntry = allVendorMentions.find(
        (v) => v._id.toString() === vendorIdStr
      );
      vendorMentionCount = vendorEntry?.mentionCount || 0;
      const rank = allVendorMentions.findIndex(
        (v) => v._id.toString() === vendorIdStr
      );
      vendorRank = rank >= 0 ? rank + 1 : allVendorMentions.length + 1;

      // Get top competitors (exclude current vendor), populate company names
      const competitorEntries = allVendorMentions
        .filter((v) => v._id.toString() !== vendorIdStr)
        .slice(0, 10);

      if (competitorEntries.length > 0) {
        const competitorIds = competitorEntries.map((v) => v._id);
        const competitorVendors = await Vendor.find(
          { _id: { $in: competitorIds } },
          { company: 1 }
        ).lean();

        const nameMap = {};
        for (const v of competitorVendors) {
          nameMap[v._id.toString()] = v.company || 'Unknown Vendor';
        }

        topCompetitors = competitorEntries.map((v) => ({
          name: nameMap[v._id.toString()] || 'Unknown Vendor',
          mentionCount: v.mentionCount,
        }));
      }
    }

    res.json({
      success: true,
      data: {
        locked: false,
        topCompetitors,
        vendorRank,
        vendorMentionCount,
        category,
        location,
      },
    });
  } catch (error) {
    console.error('AI mentions competitors error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch competitor data' });
  }
});

/**
 * GET /api/ai-mentions/lead-teaser
 * Returns count of searches in vendor's category+location (last 30 days)
 * Used to show free-tier vendors how many buyers are searching in their space
 */
router.get('/lead-teaser', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const vendor = await Vendor.findById(vendorId).select('services location').lean();

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const category = vendor.services?.[0] || '';
    const location = vendor.location?.city || '';

    if (!category || !location) {
      return res.json({
        success: true,
        data: { searchCount: 0, category, location },
      });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const searchCount = await AIMentionScan.countDocuments({
      category,
      location: { $regex: new RegExp(location, 'i') },
      scanDate: { $gte: thirtyDaysAgo },
    });

    res.json({
      success: true,
      data: { searchCount, category, location },
    });
  } catch (error) {
    console.error('Lead teaser error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead teaser data' });
  }
});

export default router;
