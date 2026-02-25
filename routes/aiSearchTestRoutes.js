/**
 * Live AI Search Test Routes
 *
 * Lets vendors test real AI queries and see if they appear in AI responses.
 * Free tier: 3 tests total. Paid tier: 10 tests per month.
 */

import express from 'express';
import mongoose from 'mongoose';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from '../models/Vendor.js';
import AIMentionScan from '../models/AIMentionScan.js';

const router = express.Router();

const PAID_TIERS = ['basic', 'visible', 'managed', 'enterprise', 'verified'];
const FREE_LIMIT = 3;
const PAID_MONTHLY_LIMIT = 10;

/**
 * Check usage limits
 */
async function checkUsageLimits(vendorId, tier) {
  const isPaid = PAID_TIERS.includes((tier || 'free').toLowerCase());

  if (isPaid) {
    // Paid: 10 tests this calendar month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usedThisMonth = await AIMentionScan.countDocuments({
      vendorId,
      source: 'live_test',
      scanDate: { $gte: startOfMonth },
    });

    return {
      allowed: usedThisMonth < PAID_MONTHLY_LIMIT,
      remaining: Math.max(0, PAID_MONTHLY_LIMIT - usedThisMonth),
      limit: PAID_MONTHLY_LIMIT,
      isPaid: true,
      resetDate: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1).toISOString(),
    };
  } else {
    // Free: 3 tests total (ever)
    const totalUsed = await AIMentionScan.countDocuments({
      vendorId,
      source: 'live_test',
    });

    return {
      allowed: totalUsed < FREE_LIMIT,
      remaining: Math.max(0, FREE_LIMIT - totalUsed),
      limit: FREE_LIMIT,
      isPaid: false,
      resetDate: null,
    };
  }
}

/**
 * Parse AI response for company mentions
 */
function parseAIResponse(responseText, vendorCompanyName) {
  // Normalize vendor name for matching
  const normalizedVendor = vendorCompanyName
    .replace(/\s*(ltd|limited|plc|inc|llc|group|uk|services)\s*\.?$/i, '')
    .trim()
    .toLowerCase();

  const text = responseText.toLowerCase();

  // Check if vendor is mentioned
  const vendorFound = text.includes(normalizedVendor) ||
    text.includes(vendorCompanyName.toLowerCase());

  // Find vendor position by looking for numbered lists or sequential mentions
  let vendorPosition = 'not_mentioned';
  if (vendorFound) {
    // Check position in the response
    const vendorIndex = text.indexOf(normalizedVendor);
    if (vendorIndex === -1) {
      vendorPosition = 'mentioned';
    } else {
      // Count how many company-like names appear before vendor
      const textBeforeVendor = text.substring(0, vendorIndex);
      const numberedPattern = /\d+\.\s+\*?\*?[a-z]/g;
      const matchesBefore = textBeforeVendor.match(numberedPattern) || [];

      if (matchesBefore.length === 0) vendorPosition = 'first';
      else if (matchesBefore.length <= 2) vendorPosition = 'top3';
      else vendorPosition = 'mentioned';
    }
  }

  // Extract company names from numbered lists and bold text
  const companies = [];
  // Match numbered items: "1. Company Name" or "1. **Company Name**"
  const numberedRegex = /\d+\.\s+\*?\*?([A-Z][A-Za-z\s&'.-]+?)(?:\*?\*?\s*[-–—:]|\*?\*?\s*\n|\*?\*?\s*$)/gm;
  let match;
  while ((match = numberedRegex.exec(responseText)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && name.length < 60) {
      companies.push(name);
    }
  }

  // Also check bold text patterns: **Company Name**
  const boldRegex = /\*\*([A-Z][A-Za-z\s&'.-]+?)\*\*/g;
  while ((match = boldRegex.exec(responseText)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && name.length < 60 && !companies.includes(name)) {
      companies.push(name);
    }
  }

  // Filter out the vendor's own name from competitors
  const competitors = companies.filter(
    (c) => !c.toLowerCase().includes(normalizedVendor) &&
      !normalizedVendor.includes(c.toLowerCase())
  );

  return {
    vendorFound,
    vendorPosition,
    totalCompaniesRecommended: companies.length,
    competitorsInResponse: competitors,
  };
}

/**
 * POST /api/ai-search-test
 * Run a live AI search test
 */
router.post('/', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    const { query } = req.body;

    if (!query || query.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 5 characters',
      });
    }

    // Fetch vendor
    const vendor = await Vendor.findById(vendorId)
      .select('company tier services location')
      .lean();

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Check usage limits
    const usage = await checkUsageLimits(vendorId, vendor.tier);
    if (!usage.allowed) {
      return res.json({
        success: true,
        data: {
          limited: true,
          message: usage.isPaid
            ? `You've used all ${usage.limit} tests this month. Tests reset on ${new Date(usage.resetDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`
            : `You've used all ${usage.limit} free tests. Upgrade to Starter for ${PAID_MONTHLY_LIMIT} monthly tests.`,
          testsRemaining: 0,
          isPaid: usage.isPaid,
          resetDate: usage.resetDate,
        },
      });
    }

    // Call Claude Haiku via dynamic import
    let aiResponse;
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: 'You are a helpful business assistant. The user is looking for a supplier or service provider in the UK. Give specific company recommendations with brief reasons why each is good. Include real company names you know of.',
        messages: [{ role: 'user', content: query.trim() }],
      });

      aiResponse = message.content[0]?.text || '';
    } catch (aiErr) {
      console.error('AI search test - Claude API error:', aiErr.message);
      return res.status(503).json({
        success: false,
        error: 'AI service temporarily unavailable. Please try again.',
      });
    }

    // Parse the response
    const parsed = parseAIResponse(aiResponse, vendor.company);

    // Save as AIMentionScan (live_test)
    const category = vendor.services?.[0] || 'General';
    const location = vendor.location?.city || 'UK';

    await AIMentionScan.create({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      scanDate: new Date(),
      prompt: query.trim(),
      mentioned: parsed.vendorFound,
      position: parsed.vendorPosition,
      aiModel: 'claude-haiku',
      competitorsMentioned: parsed.competitorsInResponse.slice(0, 10),
      category,
      location,
      responseSnippet: aiResponse.substring(0, 500),
      source: 'live_test',
    });

    // Recalculate remaining
    const updatedUsage = await checkUsageLimits(vendorId, vendor.tier);

    res.json({
      success: true,
      data: {
        query: query.trim(),
        aiResponse,
        vendorFound: parsed.vendorFound,
        vendorPosition: parsed.vendorPosition,
        totalCompaniesRecommended: parsed.totalCompaniesRecommended,
        competitorsInResponse: parsed.competitorsInResponse,
        testsRemaining: updatedUsage.remaining,
        isPaid: updatedUsage.isPaid,
        resetDate: updatedUsage.resetDate,
      },
    });
  } catch (error) {
    console.error('AI search test error:', error);
    res.status(500).json({ success: false, error: 'Failed to run AI search test' });
  }
});

/**
 * GET /api/ai-search-test/history
 * Get test history for the authenticated vendor
 */
router.get('/history', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;

    const tests = await AIMentionScan.find({
      vendorId,
      source: 'live_test',
    })
      .sort({ scanDate: -1 })
      .limit(20)
      .select('scanDate prompt mentioned position competitorsMentioned responseSnippet')
      .lean();

    // Get usage info
    const vendor = await Vendor.findById(vendorId).select('tier').lean();
    const usage = await checkUsageLimits(vendorId, vendor?.tier);

    res.json({
      success: true,
      data: {
        tests: tests.map((t) => ({
          id: t._id.toString(),
          date: t.scanDate,
          query: t.prompt,
          found: t.mentioned,
          position: t.position,
          competitors: t.competitorsMentioned || [],
          snippet: t.responseSnippet,
        })),
        testsRemaining: usage.remaining,
        isPaid: usage.isPaid,
        resetDate: usage.resetDate,
      },
    });
  } catch (error) {
    console.error('AI search test history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch test history' });
  }
});

export default router;
