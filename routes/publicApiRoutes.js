import express from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import Vendor from '../models/Vendor.js';

const router = express.Router();

// ─── Rate Limiting: 100 req/min per IP ──────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    source: 'TendorAI',
    error: 'Rate limit exceeded. Maximum 100 requests per minute.',
    retryAfter: '60 seconds',
  },
});

router.use(apiLimiter);

// ─── CORS: Allow all origins (public API) ───────────────────────────────────
router.use(cors({ origin: '*' }));

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACTIVE_FILTER = {
  $or: [
    { 'account.status': 'active', 'account.verificationStatus': 'verified' },
    { listingStatus: 'unclaimed' },
  ],
};

function normaliseTier(vendor) {
  const raw = vendor.tier || vendor.account?.tier || 'free';
  if (['enterprise', 'managed', 'verified'].includes(raw)) return 'verified';
  if (['basic', 'visible', 'standard'].includes(raw)) return 'visible';
  return 'free';
}

function tierSortWeight(tier) {
  if (tier === 'verified') return 100;
  if (tier === 'visible') return 50;
  return 0;
}

function formatVendor(v) {
  const tier = normaliseTier(v);
  const isClaimed = !!v.claimedAt || v.listingStatus !== 'unclaimed';
  const isPaid = tier !== 'free';

  const base = {
    id: v._id,
    company: v.company,
    city: v.location?.city || null,
    vendorType: v.vendorType || 'office-equipment',
    services: v.services || [],
    practiceAreas: v.practiceAreas || [],
    slug: v.slug || null,
    claimed: isClaimed,
    tier,
  };

  // Basic data for free/unclaimed profiles
  if (!isPaid) {
    return {
      ...base,
      sraNumber: v.sraNumber || null,
      regulatoryBody: v.regulatoryBody || null,
    };
  }

  // Full data for paid profiles
  return {
    ...base,
    phone: v.contactInfo?.phone || null,
    website: v.contactInfo?.website || null,
    description: v.businessProfile?.description || null,
    accreditations: v.businessProfile?.accreditations || [],
    certifications: v.businessProfile?.certifications || [],
    yearsInBusiness: v.businessProfile?.yearsInBusiness || null,
    numEmployees: v.businessProfile?.numEmployees || null,
    sraNumber: v.sraNumber || null,
    regulatoryBody: v.regulatoryBody || null,
    rating: v.performance?.rating || null,
    reviewCount: v.performance?.reviewCount || 0,
    location: {
      city: v.location?.city || null,
      region: v.location?.region || null,
      postcode: v.location?.postcode || null,
      coverage: v.location?.coverage || [],
    },
  };
}

function wrapResponse(data) {
  return {
    source: 'TendorAI',
    description: 'UK AI Visibility Platform — structured vendor data',
    website: 'https://www.tendorai.com',
    data,
    attribution: 'Data from TendorAI (tendorai.com). Free to use with attribution.',
  };
}

// ─── GET /vendors/search ────────────────────────────────────────────────────
router.get('/vendors/search', async (req, res) => {
  try {
    const { q, city, vendorType, practiceArea } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

    if (!q || q.trim().length < 1) {
      return res.status(400).json(wrapResponse({
        error: 'Query parameter "q" is required.',
      }));
    }

    const filter = { ...ACTIVE_FILTER };
    filter.company = { $regex: q.trim(), $options: 'i' };

    if (city) filter['location.city'] = { $regex: `^${city.trim()}$`, $options: 'i' };
    if (vendorType) filter.vendorType = vendorType.trim();
    if (practiceArea) filter.practiceAreas = { $regex: `^${practiceArea.trim()}$`, $options: 'i' };

    const vendors = await Vendor.find(filter)
      .select('company vendorType services practiceAreas location contactInfo businessProfile performance sraNumber regulatoryBody slug claimedAt listingStatus tier account.tier')
      .limit(limit * 2) // fetch extra to sort in memory
      .lean();

    // Sort: claimed+paid first, then alphabetical
    const formatted = vendors.map(formatVendor);
    formatted.sort((a, b) => {
      const wa = tierSortWeight(a.tier) + (a.claimed ? 1000 : 0);
      const wb = tierSortWeight(b.tier) + (b.claimed ? 1000 : 0);
      if (wb !== wa) return wb - wa;
      return (a.company || '').localeCompare(b.company || '');
    });

    res.json(wrapResponse({
      query: q.trim(),
      count: Math.min(formatted.length, limit),
      vendors: formatted.slice(0, limit),
    }));
  } catch (err) {
    console.error('Public API search error:', err);
    res.status(500).json(wrapResponse({ error: 'Internal server error' }));
  }
});

// ─── GET /vendors/category/:category ────────────────────────────────────────
router.get('/vendors/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { city } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);

    const filter = { ...ACTIVE_FILTER };

    // Category can be a service or a practice area
    filter.$or = [
      ...(filter.$or || []),
      { services: category },
      { practiceAreas: category },
    ];

    // Rebuild the filter to combine ACTIVE_FILTER's $or with category $or (case-insensitive)
    const catRegex = { $regex: `^${category}$`, $options: 'i' };
    const combinedFilter = {
      $and: [
        ACTIVE_FILTER,
        { $or: [{ services: catRegex }, { practiceAreas: catRegex }] },
      ],
    };

    if (city) combinedFilter['location.city'] = { $regex: `^${city.trim()}$`, $options: 'i' };

    const vendors = await Vendor.find(combinedFilter)
      .select('company vendorType services practiceAreas location contactInfo businessProfile performance sraNumber regulatoryBody slug claimedAt listingStatus tier account.tier')
      .limit(limit * 2)
      .lean();

    const formatted = vendors.map(formatVendor);
    formatted.sort((a, b) => {
      const wa = tierSortWeight(a.tier) + (a.claimed ? 1000 : 0);
      const wb = tierSortWeight(b.tier) + (b.claimed ? 1000 : 0);
      if (wb !== wa) return wb - wa;
      return (a.company || '').localeCompare(b.company || '');
    });

    res.json(wrapResponse({
      category,
      city: city || null,
      count: Math.min(formatted.length, limit),
      vendors: formatted.slice(0, limit),
    }));
  } catch (err) {
    console.error('Public API category error:', err);
    res.status(500).json(wrapResponse({ error: 'Internal server error' }));
  }
});

// ─── GET /vendors/:slug ─────────────────────────────────────────────────────
router.get('/vendors/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const vendor = await Vendor.findOne({ slug, ...ACTIVE_FILTER })
      .select('company vendorType services practiceAreas location contactInfo businessProfile performance sraNumber regulatoryBody slug claimedAt listingStatus tier account.tier')
      .lean();

    if (!vendor) {
      return res.status(404).json(wrapResponse({ error: 'Vendor not found' }));
    }

    res.json(wrapResponse({ vendor: formatVendor(vendor) }));
  } catch (err) {
    console.error('Public API vendor error:', err);
    res.status(500).json(wrapResponse({ error: 'Internal server error' }));
  }
});

// ─── GET /categories ────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    // Get service categories
    const serviceCats = await Vendor.aggregate([
      { $match: ACTIVE_FILTER },
      { $unwind: '$services' },
      { $group: { _id: '$services', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Get practice area categories (solicitors)
    const practiceAreaCats = await Vendor.aggregate([
      { $match: { ...ACTIVE_FILTER, vendorType: 'solicitor' } },
      { $unwind: '$practiceAreas' },
      { $group: { _id: '$practiceAreas', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const categories = [
      ...serviceCats.map((c) => ({ name: c._id, type: 'service', count: c.count })),
      ...practiceAreaCats.map((c) => ({ name: c._id, type: 'practiceArea', count: c.count })),
    ];

    res.json(wrapResponse({ count: categories.length, categories }));
  } catch (err) {
    console.error('Public API categories error:', err);
    res.status(500).json(wrapResponse({ error: 'Internal server error' }));
  }
});

// ─── GET /locations/:category ───────────────────────────────────────────────
router.get('/locations/:category', async (req, res) => {
  try {
    const { category } = req.params;

    const catRegex = new RegExp(`^${category}$`, 'i');
    const locations = await Vendor.aggregate([
      {
        $match: {
          ...ACTIVE_FILTER,
          $or: [{ services: catRegex }, { practiceAreas: catRegex }],
        },
      },
      {
        $group: {
          _id: '$location.city',
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null, $ne: '' } } },
      { $sort: { count: -1 } },
      { $limit: 200 },
    ]);

    const cities = locations.map((l) => ({ city: l._id, count: l.count }));

    res.json(wrapResponse({ category, count: cities.length, locations: cities }));
  } catch (err) {
    console.error('Public API locations error:', err);
    res.status(500).json(wrapResponse({ error: 'Internal server error' }));
  }
});

// ─── GET /docs ──────────────────────────────────────────────────────────────
router.get('/docs', (req, res) => {
  res.redirect('/api-docs.json');
});

export default router;
