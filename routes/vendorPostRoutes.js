import express from 'express';
import VendorPost from '../models/VendorPost.js';
import Vendor from '../models/Vendor.js';
import vendorAuth from '../middleware/vendorAuth.js';

const router = express.Router();

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

// POST /api/vendors/:vendorId/posts/generate — AI blog generation
router.post('/:vendorId/posts/generate', vendorAuth, async (req, res) => {
  console.log('[PostGenerate] Route hit', { vendorId: req.params.vendorId, body: req.body });
  try {
    const { vendorId } = req.params;

    if (req.vendorId?.toString() !== vendorId) {
      return res.status(403).json({ success: false, error: 'Not authorised' });
    }

    const vendor = await Vendor.findById(vendorId).select('tier vendorType company').lean();
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Require at least starter tier
    const tier = vendor.tier || 'free';
    const paidTiers = new Set(['starter', 'pro', 'basic', 'visible', 'verified', 'managed', 'enterprise']);
    if (!paidTiers.has(tier)) {
      return res.status(403).json({ success: false, error: 'AI blog generation requires a paid plan.' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    const { topic, stats } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ success: false, error: 'Topic is required' });
    }

    const vertical = vendor.vendorType || 'professional services';
    const VERTICAL_LABELS = {
      solicitor: 'solicitor',
      accountant: 'accountant',
      'mortgage-advisor': 'mortgage adviser',
      'estate-agent': 'estate agent',
      'office-equipment': 'office equipment supplier',
    };
    const verticalLabel = VERTICAL_LABELS[vertical] || vertical;

    const systemPrompt = `You are a Senior SEO and GEO Strategist writing blog content for UK professional services firms. You write every post optimised for both Google rankings and AI citation by ChatGPT, Perplexity, Gemini, Google AI Overviews, and Copilot.

STRUCTURE — follow this for every post:
- Open with a bold hook: a specific statistic, a direct claim, or a named example. Never open with "In today's world", "Have you ever wondered", or any variation
- Answer the reader's primary question in the first 50 words. AI engines extract the first clear answer they find — do not bury it under preamble
- Include a definition block early: one standalone sentence defining the core concept. Example format: "AI visibility is the ability for a business to be recommended by tools such as ChatGPT and Perplexity when a user asks a relevant question."
- Use H2 subheadings every 150–200 words. Each H2 must open with a direct answer to the implied question in the first 40 words and be independently readable without context from the rest of the article
- Include a specific data point, statistic, or quantified claim every 150–200 words. Unsupported opinion does not get cited by AI engines
- Include a FAQ section with exactly 4 questions and direct answers. Use the exact question as the H3 heading. Position FAQs after the most relevant section — not at the end
- End with a clear call to action for the firm's services
- Target length: 700–900 words

CONTENT RULES:
- Short paragraphs: 3 sentences maximum
- Bold genuinely important phrases only — not decorative bolding
- Name specific organisations, regulators, tools, and platforms throughout. "The SRA" is more citable than "the regulator". "Xero" is more citable than "accounting software"
- Include the current year (2026) in the title or first section as a recency signal
- Use list-based formats where natural: Steps to X, Types of X, Benefits of X, How to X
- Write in first person plural ("we", "our firm") as if you are the firm
- UK English spelling throughout
- Never mention TendorAI

BANNED PHRASES — never use:
"In today's fast-paced", "Let's dive in", "In conclusion", "It's worth noting", "Without further ado", "Moreover", "Furthermore", "Additionally", "That being said", "It is important to note"

INDUSTRY REQUIREMENTS — include these signals where relevant:
Solicitor: SRA registration number, CQS or Lexcel accreditation, Law Society guidance references
Accountant: ICAEW or ACCA registration, MTD compliance, HMRC guidance references, specific software (Xero, QuickBooks, Sage)
Mortgage adviser: FCA authorisation number, whole of market vs restricted, lender panel size
Estate agent: Propertymark or NAEA membership, TPO membership, Rightmove/Zoopla presence, achieved vs asking percentage
Office equipment: specific brands (Konica Minolta, Ricoh, Canon, Xerox), cost per page, lease vs purchase terms

LINKEDIN VERSION: 150–200 words, professional tone, includes one specific data point, ends with a question to drive comments, self-contained — no teaser requiring a link click
FACEBOOK VERSION: 100–150 words, warmer tone, one specific example or stat, ends with a call to action

Return as JSON only with this exact structure — no markdown fences, no preamble:
{"title":"...","body":"...","linkedInText":"...","facebookText":"..."}`;

    const userPrompt = `Write a blog post for a ${verticalLabel} firm about: ${topic.trim()}

${stats ? `Include these stats or facts: ${stats.trim()}` : ''}

Also write:
1. A LinkedIn post version (150-200 words)
2. A Facebook post version (100-150 words)

Return as JSON only with this exact structure:
{
  "title": "Blog post title",
  "body": "Full blog post in markdown",
  "linkedInText": "LinkedIn version",
  "facebookText": "Facebook version"
}`;

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Parse JSON from response
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
    });
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
