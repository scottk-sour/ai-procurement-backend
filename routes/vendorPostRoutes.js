import express from 'express';
import VendorPost from '../models/VendorPost.js';
import Vendor from '../models/Vendor.js';
import vendorAuth from '../middleware/vendorAuth.js';

const router = express.Router();

// Tier-based post limits per month
const POST_LIMITS = {
  free: 0,
  listed: 0,
  visible: 2,
  basic: 2,
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
        error: 'Your tier does not allow posting. Upgrade to Visible or Verified.',
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

    const { title, body, category, tags } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'Title and body are required' });
    }

    const post = new VendorPost({
      vendor: vendorId,
      title: title.trim(),
      body: body.trim(),
      category: category || 'news',
      tags: tags || [],
      isDemoVendor: vendor.isDemoVendor || false,
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
