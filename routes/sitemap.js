// routes/sitemap.js
// Dynamic XML sitemap generation with all category/location combinations

import express from 'express';
import Vendor from '../models/Vendor.js';

const router = express.Router();

// Base URL for the site
const BASE_URL = 'https://www.tendorai.com';

// Static pages with their priorities and change frequencies
const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/login', priority: '0.6', changefreq: 'monthly' },
  { path: '/signup', priority: '0.7', changefreq: 'monthly' },
  { path: '/vendor-login', priority: '0.6', changefreq: 'monthly' },
  { path: '/vendor-signup', priority: '0.7', changefreq: 'monthly' },
  { path: '/how-it-works', priority: '0.8', changefreq: 'weekly' },
  { path: '/contact', priority: '0.7', changefreq: 'monthly' },
  { path: '/about-us', priority: '0.7', changefreq: 'monthly' },
  { path: '/why-choose-us', priority: '0.8', changefreq: 'weekly' },
  { path: '/privacy-policy', priority: '0.3', changefreq: 'yearly' },
  { path: '/faq', priority: '0.7', changefreq: 'weekly' },
  // Service pages
  { path: '/services/photocopiers', priority: '0.9', changefreq: 'weekly' },
  { path: '/services/telecoms', priority: '0.9', changefreq: 'weekly' },
  { path: '/services/cctv', priority: '0.9', changefreq: 'weekly' },
  { path: '/services/it', priority: '0.9', changefreq: 'weekly' },
  // Supplier directory index
  { path: '/suppliers', priority: '0.9', changefreq: 'daily' },
];

// Major UK cities for SEO (top 40)
const UK_CITIES = [
  'london', 'birmingham', 'manchester', 'leeds', 'glasgow',
  'liverpool', 'newcastle', 'sheffield', 'bristol', 'edinburgh',
  'cardiff', 'belfast', 'nottingham', 'leicester', 'coventry',
  'bradford', 'stoke-on-trent', 'wolverhampton', 'plymouth', 'southampton',
  'reading', 'derby', 'dudley', 'northampton', 'portsmouth',
  'luton', 'preston', 'aberdeen', 'milton-keynes', 'sunderland',
  'norwich', 'swansea', 'bournemouth', 'brighton', 'hull',
  'peterborough', 'stockport', 'oxford', 'cambridge', 'york'
];

// Service categories
const CATEGORIES = [
  'photocopiers',
  'telecoms',
  'cctv',
  'it-services',
  'office-equipment',
  'security-systems'
];

/**
 * GET /sitemap.xml
 * Generate dynamic XML sitemap
 */
router.get('/sitemap.xml', async (req, res) => {
  try {
    const urls = [];
    const now = new Date().toISOString().split('T')[0];

    // Add static pages
    STATIC_PAGES.forEach(page => {
      urls.push({
        loc: `${BASE_URL}${page.path}`,
        lastmod: now,
        changefreq: page.changefreq,
        priority: page.priority
      });
    });

    // Generate category/location combinations
    for (const category of CATEGORIES) {
      for (const location of UK_CITIES) {
        urls.push({
          loc: `${BASE_URL}/suppliers/${category}/${location}`,
          lastmod: now,
          changefreq: 'weekly',
          priority: '0.8'
        });
      }
    }

    // Fetch actual vendor locations from database for more specific pages
    try {
      const vendorLocations = await Vendor.aggregate([
        {
          $match: {
            'account.status': 'active',
            'account.verificationStatus': 'verified'
          }
        },
        { $unwind: '$services' },
        { $unwind: '$location.coverage' },
        {
          $group: {
            _id: {
              service: '$services',
              location: '$location.coverage'
            },
            count: { $sum: 1 }
          }
        },
        {
          $match: { count: { $gte: 1 } }
        },
        { $limit: 500 } // Limit to prevent sitemap bloat
      ]);

      // Add database-driven pages (excluding duplicates with static list)
      const existingPaths = new Set(urls.map(u => u.loc));

      vendorLocations.forEach(item => {
        const service = item._id.service?.toLowerCase().replace(/\s+/g, '-') || '';
        const location = item._id.location?.toLowerCase().replace(/\s+/g, '-') || '';

        if (service && location) {
          const path = `${BASE_URL}/suppliers/${service}/${location}`;
          if (!existingPaths.has(path)) {
            urls.push({
              loc: path,
              lastmod: now,
              changefreq: 'weekly',
              priority: '0.7'
            });
            existingPaths.add(path);
          }
        }
      });
    } catch (dbError) {
      console.error('Sitemap DB query error:', dbError);
      // Continue with static pages only
    }

    // Generate XML
    const xml = generateSitemapXml(urls);

    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(xml);

  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

/**
 * GET /sitemap-index.xml
 * Generate sitemap index for large sites
 */
router.get('/sitemap-index.xml', async (req, res) => {
  try {
    const now = new Date().toISOString().split('T')[0];

    const sitemaps = [
      { loc: `${BASE_URL}/sitemap.xml`, lastmod: now },
      { loc: `${BASE_URL}/sitemap-categories.xml`, lastmod: now },
      { loc: `${BASE_URL}/sitemap-locations.xml`, lastmod: now }
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(sm => `  <sitemap>
    <loc>${sm.loc}</loc>
    <lastmod>${sm.lastmod}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`;

    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600');
    res.send(xml);

  } catch (error) {
    console.error('Sitemap index error:', error);
    res.status(500).send('Error generating sitemap index');
  }
});

/**
 * GET /sitemap-categories.xml
 * Category-specific sitemap
 */
router.get('/sitemap-categories.xml', async (req, res) => {
  try {
    const urls = [];
    const now = new Date().toISOString().split('T')[0];

    // All category pages across all locations
    for (const category of CATEGORIES) {
      // Category index
      urls.push({
        loc: `${BASE_URL}/suppliers/${category}`,
        lastmod: now,
        changefreq: 'daily',
        priority: '0.9'
      });

      // Category + location pages
      for (const location of UK_CITIES) {
        urls.push({
          loc: `${BASE_URL}/suppliers/${category}/${location}`,
          lastmod: now,
          changefreq: 'weekly',
          priority: '0.8'
        });
      }
    }

    const xml = generateSitemapXml(urls);

    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600');
    res.send(xml);

  } catch (error) {
    console.error('Category sitemap error:', error);
    res.status(500).send('Error generating category sitemap');
  }
});

/**
 * GET /sitemap-locations.xml
 * Location-specific sitemap
 */
router.get('/sitemap-locations.xml', async (req, res) => {
  try {
    const urls = [];
    const now = new Date().toISOString().split('T')[0];

    // All location pages
    for (const location of UK_CITIES) {
      // Location index (all categories)
      urls.push({
        loc: `${BASE_URL}/suppliers/all/${location}`,
        lastmod: now,
        changefreq: 'daily',
        priority: '0.8'
      });
    }

    const xml = generateSitemapXml(urls);

    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600');
    res.send(xml);

  } catch (error) {
    console.error('Location sitemap error:', error);
    res.status(500).send('Error generating location sitemap');
  }
});

/**
 * Helper to generate XML sitemap
 */
function generateSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls.map(url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default router;
