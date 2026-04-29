import express from 'express';
import VendorPost from '../models/VendorPost.js';
import Vendor from '../models/Vendor.js';
import vendorAuth from '../middleware/vendorAuth.js';
import {
  PILLAR_LIBRARIES,
  VERTICAL_ENTITIES,
  LINKEDIN_HOOK_TYPES, // eslint-disable-line no-unused-vars
} from '../services/contentPlanner/pillarLibraries.js';
import { SYSTEM_PROMPT_V7, VERTICAL_LABELS } from '../services/contentPlanner/prompts.js';

const router = express.Router();

// ─── v7 content generator — prompt, labels, user-prompt builder ────────

/**
 * Build the v7 user prompt from a request/vendor/library context.
 * Exported for unit testing — pure function, no side effects.
 *
 * @param {Object} ctx
 * @param {string} ctx.topic                   - Raw topic string from the request.
 * @param {string} [ctx.stats]                 - Optional free-text stats/facts.
 * @param {string} [ctx.primaryData]           - Vendor's own first-party data.
 * @param {string} ctx.verticalLabel           - Friendly label for the vendor type.
 * @param {string} [ctx.vendorCity]            - City the firm operates in.
 * @param {string} [ctx.vendorName]            - Firm's company name.
 * @param {Object|null} ctx.pillarSpec         - Resolved pillar+topic template (or null for generic).
 * @param {string[]} ctx.vendorTypeEntities    - Named entities to reference at least twice.
 * @param {string} [ctx.linkedInHookType]      - opinion | data | personal | curiosity.
 * @returns {string}
 */
export function buildUserPrompt(ctx) {
  const {
    topic, stats, primaryData, verticalLabel, vendorCity,
    vendorName, pillarSpec, vendorTypeEntities, linkedInHookType,
  } = ctx;

  const lines = [];

  lines.push(`Write a v7-compliant blog post for ${vendorName || ('a ' + verticalLabel + ' firm')}${vendorCity ? ' based in ' + vendorCity : ''}.`);

  lines.push('');
  lines.push(`Topic: ${topic.trim()}`);

  if (pillarSpec) {
    lines.push('');
    lines.push(`This topic is from the ${pillarSpec.pillarName} pillar.`);
    if (pillarSpec.tactic) lines.push(`Tactic: ${pillarSpec.tactic}`);
    if (pillarSpec.mustInclude && pillarSpec.mustInclude.length) {
      lines.push(`Must include: ${pillarSpec.mustInclude.join('; ')}`);
    }
    if (pillarSpec.wordCount) lines.push(`Word count target: ${pillarSpec.wordCount} words.`);
    if (pillarSpec.primaryAIQuery) lines.push(`Primary AI query this post targets: "${pillarSpec.primaryAIQuery}"`);
    if (pillarSpec.secondaryQueries && pillarSpec.secondaryQueries.length) {
      lines.push(`Secondary queries: ${pillarSpec.secondaryQueries.map((q) => '"' + q + '"').join(', ')}`);
    }
  }

  lines.push('');
  if (vendorTypeEntities && vendorTypeEntities.length) {
    lines.push(`Named entities relevant to ${verticalLabel} firms that you should reference (at least 2): ${vendorTypeEntities.join(', ')}.`);
  }

  if (pillarSpec && pillarSpec.namedEntities && pillarSpec.namedEntities.length) {
    lines.push(`Topic-specific entities: ${pillarSpec.namedEntities.join(', ')}.`);
  }

  lines.push('');
  if (primaryData && primaryData.trim()) {
    lines.push(`The firm has provided this first-party data — weave it into the post naturally: "${primaryData.trim()}"`);
  } else if (pillarSpec && pillarSpec.primaryDataHook) {
    lines.push(`Primary data hook — prompt the reader with a template they can fill in. Example pattern: "${pillarSpec.primaryDataHook}"`);
  }

  if (stats && stats.trim()) {
    lines.push(`Additional stats or facts to include: ${stats.trim()}`);
  }

  lines.push('');
  lines.push(`LinkedIn hook type for the LinkedIn variant: ${linkedInHookType || 'opinion'}.`);

  lines.push('');
  lines.push('Return only the JSON described in the system prompt. No preamble, no markdown fence, no commentary.');

  return lines.join('\n');
}


// Tier-based post limits per month
const POST_LIMITS = {
  free: 0,
  listed: 0,
  starter: 2,
  visible: 2,
  basic: 2,
  pro: Infinity,
  verified: Infinity,
  managed: Infinity,
  enterprise: Infinity,
};

// POST /api/vendors/:vendorId/posts — create post (auth required)
router.post('/:vendorId/posts', vendorAuth, async (req, res) => {
  try {
    const { vendorId } = req.params;

    // Verify the authenticated vendor matches the route
    if (req.vendorId?.toString() !== vendorId) {
      return res.status(403).json({ success: false, error: 'Not authorised to post for this vendor' });
    }

    const vendor = await Vendor.findById(vendorId).select('tier company').lean();
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Check tier limit
    const tier = vendor.tier || 'free';
    const monthlyLimit = POST_LIMITS[tier] ?? 0;
    if (monthlyLimit === 0) {
      return res.status(403).json({
        success: false,
        error: 'Your tier does not allow posting. Upgrade to Starter or Pro.',
        upgradeUrl: 'https://www.tendorai.com/vendor-pricing',
      });
    }

    if (monthlyLimit !== Infinity) {
      // Count posts this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const postsThisMonth = await VendorPost.countDocuments({
        vendor: vendorId,
        createdAt: { $gte: startOfMonth },
      });
      if (postsThisMonth >= monthlyLimit) {
        return res.status(403).json({
          success: false,
          error: `You have reached your monthly post limit (${monthlyLimit} per month). Upgrade to Verified for unlimited posts.`,
          upgradeUrl: 'https://www.tendorai.com/vendor-pricing',
        });
      }
    }

    const { title, body, category, tags, status, aiGenerated, topic, stats, linkedInText, facebookText } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'Title and body are required' });
    }

    const post = new VendorPost({
      vendor: vendorId,
      title: title.trim(),
      body: body.trim(),
      category: category || 'news',
      tags: tags || [],
      status: status === 'draft' ? 'draft' : 'published',
      isDemoVendor: vendor.isDemoVendor || false,
      aiGenerated: !!aiGenerated,
      topic: topic || undefined,
      stats: stats || undefined,
      linkedInText: linkedInText || undefined,
      facebookText: facebookText || undefined,
    });

    await post.save();
    res.status(201).json({ success: true, post });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'A post with this title already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/vendors/:vendorId/posts/:postId — update/edit a post
router.put('/:vendorId/posts/:postId', vendorAuth, async (req, res) => {
  try {
    const { vendorId, postId } = req.params;

    if (req.vendorId?.toString() !== vendorId) {
      return res.status(403).json({ success: false, error: 'Not authorised' });
    }

    const post = await VendorPost.findOne({ _id: postId, vendor: vendorId });
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const { title, body, status, category, linkedInText, facebookText } = req.body;
    if (title !== undefined) post.title = title.trim();
    if (body !== undefined) post.body = body.trim();
    if (status !== undefined && ['draft', 'published', 'hidden'].includes(status)) post.status = status;
    if (category !== undefined) post.category = category;
    if (linkedInText !== undefined) post.linkedInText = linkedInText;
    if (facebookText !== undefined) post.facebookText = facebookText;

    await post.save();
    res.json({ success: true, post });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'A post with this title already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/vendors/:vendorId/posts/generate — v7 AI blog generation.
//
// Request body (all optional except topic):
//   topic        string   — required
//   stats        string   — free-text facts to weave in
//   pillar       string   — one of the six v7 pillar ids (costs-fees, ...).
//                           If present and valid, the matching topic
//                           template is looked up in PILLAR_LIBRARIES and
//                           the prompt is built with must-includes, named
//                           entities, word-count target, and query
//                           targeting baked in. If absent, generic v7
//                           prompt is used (backward compatible with the
//                           current frontend).
//   topicIndex   integer  — which of the four topics within the pillar
//                           (0-3). Defaults to 0.
//   primaryData  string   — vendor's first-party numbers/facts.
router.post('/:vendorId/posts/generate', vendorAuth, async (req, res) => {
  console.log('[PostGenerate] Route hit', { vendorId: req.params.vendorId, body: req.body });
  try {
    const { vendorId } = req.params;

    if (req.vendorId?.toString() !== vendorId) {
      return res.status(403).json({ success: false, error: 'Not authorised' });
    }

    const vendor = await Vendor.findById(vendorId)
      .select('tier vendorType company location.city')
      .lean();
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const tier = vendor.tier || 'free';
    const paidTiers = new Set(['starter', 'pro', 'basic', 'visible', 'verified', 'managed', 'enterprise']);
    if (!paidTiers.has(tier)) {
      return res.status(403).json({ success: false, error: 'AI blog generation requires a paid plan.' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    const { topic, stats, pillar, topicIndex = 0, primaryData = '' } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ success: false, error: 'Topic is required' });
    }

    const vertical = vendor.vendorType || 'professional services';
    const verticalLabel = VERTICAL_LABELS[vertical] || vertical;

    // Resolve pillar → topic template from the library.
    let pillarSpec = null;
    let linkedInHookType = 'opinion';
    if (pillar) {
      const libraryForVertical = PILLAR_LIBRARIES[vendor.vendorType];
      if (!libraryForVertical) {
        return res.status(400).json({
          success: false,
          error: `No pillar library for vendor type: ${vendor.vendorType}`,
        });
      }
      const pillarObj = libraryForVertical.find((p) => p.id === pillar);
      if (!pillarObj) {
        return res.status(400).json({ success: false, error: `Invalid pillar: ${pillar}` });
      }
      const topicTemplate = pillarObj.topics[topicIndex] || pillarObj.topics[0];
      if (!topicTemplate) {
        return res.status(400).json({
          success: false,
          error: `Pillar '${pillar}' has no topics defined yet`,
        });
      }
      pillarSpec = { ...topicTemplate, pillarName: pillarObj.name };
      if (topicTemplate.linkedInHookType) linkedInHookType = topicTemplate.linkedInHookType;
    }

    const vendorTypeEntities =
      VERTICAL_ENTITIES[vendor.vendorType] ||
      VERTICAL_ENTITIES['professional-services'] ||
      [];

    const userPrompt = buildUserPrompt({
      topic,
      stats,
      primaryData,
      verticalLabel,
      vendorCity: vendor.location?.city,
      vendorName: vendor.company,
      pillarSpec,
      vendorTypeEntities,
      linkedInHookType,
    });

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.7,
      system: SYSTEM_PROMPT_V7,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ success: false, error: 'Failed to parse AI response' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    res.json({
      success: true,
      title: parsed.title || '',
      body: parsed.body || '',
      linkedInText: parsed.linkedInText || '',
      facebookText: parsed.facebookText || '',
      plan: pillarSpec || null,
      pillar: pillar || null,
    });

    // Auto-detect: onboarding checklist — firstPillarPostGenerated
    // and firstPrimaryDataAdded. Only fires after the LLM call AND
    // the JSON parse have succeeded — a failed generate doesn't
    // trigger checklist progress.
    //
    // Each flag is written via an atomic updateOne whose query filters
    // on the current state. If the flag is already true, the write
    // is a no-op and the timestamp stays at the original first-time
    // value (idempotent). The handler's vendor.findById doesn't select
    // the checklist field, so we can't read-then-write — the query
    // condition does the gating instead.
    try {
      const now = new Date();
      const hasPillar = typeof pillar === 'string' && pillar.trim();
      const hasPrimaryData = typeof primaryData === 'string' && primaryData.trim();
      const writes = [];
      if (hasPillar) {
        writes.push(Vendor.updateOne(
          {
            _id: vendorId,
            $or: [
              { 'onboardingChecklist.firstPillarPostGenerated': { $ne: true } },
              { 'onboardingChecklist.firstPillarPostGenerated': { $exists: false } },
            ],
          },
          {
            $set: {
              'onboardingChecklist.firstPillarPostGenerated': true,
              'onboardingChecklist.firstPillarPostGeneratedAt': now,
            },
          },
        ));
      }
      if (hasPrimaryData) {
        writes.push(Vendor.updateOne(
          {
            _id: vendorId,
            $or: [
              { 'onboardingChecklist.firstPrimaryDataAdded': { $ne: true } },
              { 'onboardingChecklist.firstPrimaryDataAdded': { $exists: false } },
            ],
          },
          {
            $set: {
              'onboardingChecklist.firstPrimaryDataAdded': true,
              'onboardingChecklist.firstPrimaryDataAddedAt': now,
            },
          },
        ));
      }
      if (writes.length) await Promise.all(writes);
    } catch (checklistErr) {
      console.error('[OnboardingChecklist] post-generate detect failed for vendor',
        vendorId, checklistErr?.message || checklistErr);
    }
  } catch (error) {
    console.error('[PostGenerate] Error:', error.message);
    console.error('[PostGenerate] Stack:', error.stack);
    if (error.status) console.error('[PostGenerate] HTTP status:', error.status);
    if (error.error) console.error('[PostGenerate] API error body:', JSON.stringify(error.error));
    res.status(500).json({ success: false, error: 'AI generation failed. Please try again.' });
  }
});

// GET vendor posts moved to publicVendorRoutes.js → /api/public/vendors/:vendorId/posts

// DELETE /api/vendors/:vendorId/posts/:postId — delete own post
router.delete('/:vendorId/posts/:postId', vendorAuth, async (req, res) => {
  try {
    const { vendorId, postId } = req.params;

    if (req.vendorId?.toString() !== vendorId) {
      return res.status(403).json({ success: false, error: 'Not authorised' });
    }

    const result = await VendorPost.findOneAndDelete({ _id: postId, vendor: vendorId });
    if (!result) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/vendors/:vendorId/posts/:postId/hide — admin hide post
router.put('/:vendorId/posts/:postId/hide', vendorAuth, async (req, res) => {
  try {
    const { postId } = req.params;

    // Allow vendor owner or admin
    const post = await VendorPost.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    post.status = 'hidden';
    await post.save();
    res.json({ success: true, message: 'Post hidden' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/posts/feed — all published posts across vendors (public, for GEO crawling)
router.get('/feed', async (req, res) => {
  try {
    const { page = 1, limit = 20, category } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { status: 'published' };
    if (category) filter.category = category;

    const [posts, total] = await Promise.all([
      VendorPost.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('vendor', 'company tier location.city')
        .lean(),
      VendorPost.countDocuments(filter),
    ]);

    res.json({
      success: true,
      posts,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/posts/:slug — single post by slug (public, includes JSON-LD for Schema.org)
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const post = await VendorPost.findOne({ slug, status: 'published' })
      .populate('vendor', 'company tier location.city contactInfo.website')
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Schema.org BlogPosting JSON-LD
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      articleBody: post.body,
      datePublished: post.createdAt,
      dateModified: post.updatedAt,
      author: {
        '@type': 'Organization',
        name: post.vendor?.company || 'TendorAI Vendor',
        url: post.vendor?.contactInfo?.website || `https://www.tendorai.com/suppliers/profile/${post.vendor?._id}`,
      },
      publisher: {
        '@type': 'Organization',
        name: 'TendorAI',
        url: 'https://www.tendorai.com',
      },
      mainEntityOfPage: `https://www.tendorai.com/posts/${post.slug}`,
      keywords: post.tags?.join(', ') || '',
    };

    res.json({ success: true, post, jsonLd });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
