// routes/sitemap.js
// Dynamic XML sitemap — queries DB for all category/location/vendor URLs

import express from 'express';
import Vendor from '../models/Vendor.js';
import VendorPost from '../models/VendorPost.js';

const router = express.Router();

const BASE_URL = 'https://www.tendorai.com';

// ─── In-memory cache (1 hour) ──────────────────────────────────────
let cachedXml = null;
let cacheExpiry = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ─── Static pages ──────────────────────────────────────────────────
const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/about', priority: '0.7', changefreq: 'monthly' },
  { path: '/how-it-works', priority: '0.8', changefreq: 'monthly' },
  { path: '/contact', priority: '0.6', changefreq: 'monthly' },
  { path: '/faq', priority: '0.7', changefreq: 'monthly' },
  { path: '/for-vendors', priority: '0.9', changefreq: 'weekly' },
  { path: '/aeo-report', priority: '0.9', changefreq: 'weekly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/suppliers', priority: '0.9', changefreq: 'weekly' },
  { path: '/resources', priority: '0.8', changefreq: 'weekly' },
  // Resource articles
  { path: '/resources/photocopier-costs-uk-2026', priority: '0.7', changefreq: 'monthly' },
  { path: '/resources/copier-lease-vs-buy-uk', priority: '0.7', changefreq: 'monthly' },
  { path: '/resources/voip-vs-traditional-phone-systems', priority: '0.7', changefreq: 'monthly' },
  { path: '/resources/cctv-installation-costs-uk', priority: '0.7', changefreq: 'monthly' },
  { path: '/resources/managed-print-services-guide', priority: '0.7', changefreq: 'monthly' },
  { path: '/resources/business-phone-system-buyers-guide', priority: '0.7', changefreq: 'monthly' },
  { path: '/resources/office-security-checklist', priority: '0.7', changefreq: 'monthly' },
  { path: '/resources/ai-visibility-vs-seo-agencies', priority: '0.7', changefreq: 'monthly' },
];

// ─── Category slugs (must match frontend SERVICES keys) ───────────
const EQUIPMENT_SLUGS = [
  'photocopiers', 'telecoms', 'cctv', 'it-services',
  'office-equipment', 'security-systems',
];

const SOLICITOR_SLUGS = [
  'conveyancing', 'family-law', 'criminal-law', 'commercial-law',
  'employment-law', 'wills-and-probate', 'immigration', 'personal-injury',
];

const ACCOUNTANT_SLUGS = [
  'tax-advisory', 'audit-assurance', 'bookkeeping', 'payroll',
  'corporate-finance', 'business-advisory', 'vat-services', 'financial-planning',
];

const ALL_CATEGORY_SLUGS = [...EQUIPMENT_SLUGS, ...SOLICITOR_SLUGS, ...ACCOUNTANT_SLUGS];

// Solicitor slug → practiceArea value for DB queries
const SOLICITOR_PRACTICE_MAP = {
  conveyancing: 'Conveyancing',
  'family-law': 'Family Law',
  'criminal-law': 'Criminal Law',
  'commercial-law': 'Commercial Law',
  'employment-law': 'Employment Law',
  'wills-and-probate': 'Wills & Probate',
  immigration: 'Immigration',
  'personal-injury': 'Personal Injury',
};

// Accountant slug → practiceArea value for DB queries
const ACCOUNTANT_PRACTICE_MAP = {
  'tax-advisory': 'Tax Advisory',
  'audit-assurance': 'Audit & Assurance',
  bookkeeping: 'Bookkeeping',
  payroll: 'Payroll',
  'corporate-finance': 'Corporate Finance',
  'business-advisory': 'Business Advisory',
  'vat-services': 'VAT',
  'financial-planning': 'Financial Planning',
};

// Equipment slug → service value
const EQUIPMENT_SERVICE_MAP = {
  photocopiers: 'Photocopiers',
  telecoms: 'Telecoms',
  cctv: 'CCTV',
  'it-services': 'IT',
  'office-equipment': 'Photocopiers', // alias
  'security-systems': 'Security',
};

function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ─── Build sitemap data from DB ────────────────────────────────────
async function buildSitemapUrls() {
  const now = new Date().toISOString().split('T')[0];
  const urls = [];
  const seen = new Set();

  function add(path, priority, changefreq, lastmod) {
    const loc = `${BASE_URL}${path}`;
    if (seen.has(loc)) return;
    seen.add(loc);
    urls.push({ loc, lastmod: lastmod || now, changefreq, priority });
  }

  // 1. Static pages
  for (const p of STATIC_PAGES) {
    add(p.path, p.priority, p.changefreq);
  }

  // 2. Category index pages
  for (const slug of ALL_CATEGORY_SLUGS) {
    add(`/suppliers/${slug}`, '0.9', 'weekly');
  }

  // 3. Location pages — query DB for category+city combos with 2+ vendors
  //    Solicitors: group by practiceArea + city
  //    Equipment: group by service + coverage area
  try {
    // Solicitor location pages
    const solicitorLocations = await Vendor.aggregate([
      {
        $match: {
          vendorType: 'solicitor',
          $or: [
            { 'account.status': 'active', 'account.verificationStatus': 'verified' },
            { listingStatus: 'unclaimed' },
          ],
        },
      },
      { $unwind: '$practiceAreas' },
      {
        $group: {
          _id: { practiceArea: '$practiceAreas', city: '$location.city' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 2 }, '_id.city': { $nin: [null, ''] } } },
    ]);

    // Build reverse map: practiceArea → slug
    const paToSlug = {};
    for (const [slug, pa] of Object.entries(SOLICITOR_PRACTICE_MAP)) {
      paToSlug[pa] = slug;
    }

    for (const item of solicitorLocations) {
      const slug = paToSlug[item._id.practiceArea];
      const city = item._id.city;
      if (slug && city) {
        add(`/suppliers/${slug}/${toSlug(city)}`, '0.8', 'weekly');
      }
    }

    // Accountant location pages — practiceAreas not populated yet,
    // so group by city only and emit all 8 category slugs per city
    const accountantCities = await Vendor.aggregate([
      {
        $match: {
          vendorType: 'accountant',
          $or: [
            { 'account.status': 'active', 'account.verificationStatus': 'verified' },
            { listingStatus: 'unclaimed' },
          ],
        },
      },
      {
        $group: {
          _id: '$location.city',
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 2 }, _id: { $nin: [null, ''] } } },
    ]);

    for (const item of accountantCities) {
      const city = item._id;
      if (city) {
        for (const slug of ACCOUNTANT_SLUGS) {
          add(`/suppliers/${slug}/${toSlug(city)}`, '0.8', 'weekly');
        }
      }
    }

    // Equipment location pages
    const equipmentLocations = await Vendor.aggregate([
      {
        $match: {
          vendorType: { $nin: ['solicitor', 'accountant'] },
          $or: [
            { 'account.status': 'active', 'account.verificationStatus': 'verified' },
            { listingStatus: 'unclaimed' },
          ],
        },
      },
      { $unwind: '$services' },
      { $unwind: '$location.coverage' },
      {
        $group: {
          _id: { service: '$services', location: '$location.coverage' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 2 } } },
    ]);

    // Build reverse map: service → slug
    const svcToSlug = {};
    for (const [slug, svc] of Object.entries(EQUIPMENT_SERVICE_MAP)) {
      if (!svcToSlug[svc]) svcToSlug[svc] = slug;
    }

    for (const item of equipmentLocations) {
      const slug = svcToSlug[item._id.service];
      const loc = item._id.location;
      if (slug && loc) {
        add(`/suppliers/${slug}/${toSlug(loc)}`, '0.8', 'weekly');
      }
    }
  } catch (err) {
    console.error('Sitemap location query error:', err);
  }

  // 4. Vendor profile pages
  try {
    // Slug-based profiles (solicitors + any vendor with slug)
    const slugVendors = await Vendor.find(
      { slug: { $exists: true, $ne: null } },
      { slug: 1, updatedAt: 1 }
    ).lean();

    for (const v of slugVendors) {
      if (v.slug) {
        const mod = v.updatedAt ? v.updatedAt.toISOString().split('T')[0] : now;
        add(`/suppliers/vendor/${v.slug}`, '0.7', 'monthly', mod);
      }
    }

    // ID-based profiles (verified vendors without slugs)
    const idVendors = await Vendor.find(
      {
        'account.status': 'active',
        'account.verificationStatus': 'verified',
        $or: [{ slug: { $exists: false } }, { slug: null }],
      },
      { _id: 1, updatedAt: 1 }
    ).lean();

    for (const v of idVendors) {
      const mod = v.updatedAt ? v.updatedAt.toISOString().split('T')[0] : now;
      add(`/suppliers/profile/${v._id.toString()}`, '0.7', 'monthly', mod);
    }
  } catch (err) {
    console.error('Sitemap vendor query error:', err);
  }

  // 5. Vendor blog posts
  try {
    const posts = await VendorPost.find({ status: 'published' })
      .select('slug updatedAt')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    for (const p of posts) {
      if (p.slug) {
        const mod = p.updatedAt ? p.updatedAt.toISOString().split('T')[0] : now;
        add(`/posts/${p.slug}`, '0.6', 'monthly', mod);
      }
    }
  } catch (err) {
    console.error('Sitemap posts query error:', err);
  }

  return urls;
}

// ─── GET /sitemap.xml ──────────────────────────────────────────────
router.get('/sitemap.xml', async (req, res) => {
  try {
    // Serve from cache if still valid
    if (cachedXml && Date.now() < cacheExpiry) {
      res.header('Content-Type', 'application/xml');
      res.header('Cache-Control', 'public, max-age=3600');
      return res.send(cachedXml);
    }

    const urls = await buildSitemapUrls();
    const xml = generateSitemapXml(urls);

    // Store in cache
    cachedXml = xml;
    cacheExpiry = Date.now() + CACHE_TTL;

    console.log(`Sitemap generated: ${urls.length} URLs`);

    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

// ─── Helpers ───────────────────────────────────────────────────────
function generateSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default router;
