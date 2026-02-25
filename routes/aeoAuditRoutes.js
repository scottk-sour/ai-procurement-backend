import express from 'express';
import axios from 'axios';
import vendorAuth from '../middleware/vendorAuth.js';
import AeoAudit from '../models/AeoAudit.js';
import Vendor from '../models/Vendor.js';

const router = express.Router();

/** Paid tier names (Starter + Pro and all aliases) */
const PAID_TIERS = ['basic', 'starter', 'silver', 'visible', 'managed', 'pro', 'verified', 'gold', 'enterprise'];

/**
 * Analyse a webpage for AEO (Answer Engine Optimisation) signals.
 * Returns 10 checks, each scored 0-10, totalling 0-100.
 */
function analyseAeoSignals(html, url) {
  const checks = [];
  const recommendations = [];

  // 1. Schema.org structured data
  const ldJsonMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const schemaCount = ldJsonMatches.length;
  const schemaScore = schemaCount >= 3 ? 10 : schemaCount === 2 ? 8 : schemaCount === 1 ? 5 : 0;
  checks.push({
    name: 'Schema.org Structured Data',
    key: 'schema',
    score: schemaScore,
    maxScore: 10,
    passed: schemaScore >= 5,
    details: schemaCount > 0 ? `Found ${schemaCount} JSON-LD schema block(s)` : 'No JSON-LD structured data found',
    recommendation: schemaScore < 5 ? 'Add JSON-LD structured data (Organization, LocalBusiness, Product) so AI models can parse your business details.' : '',
  });
  if (schemaScore < 5) recommendations.push('Add JSON-LD structured data (Organization, LocalBusiness, Product schemas).');

  // 2. Meta title & description
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim() : '';
  const titleOk = title.length >= 20 && title.length <= 70;
  const descOk = description.length >= 50 && description.length <= 160;
  const metaScore = (titleOk ? 5 : title.length > 0 ? 2 : 0) + (descOk ? 5 : description.length > 0 ? 2 : 0);
  checks.push({
    name: 'Meta Title & Description',
    key: 'meta',
    score: metaScore,
    maxScore: 10,
    passed: metaScore >= 7,
    details: `Title: ${title.length} chars${titleOk ? ' (good)' : ''}, Description: ${description.length} chars${descOk ? ' (good)' : ''}`,
    recommendation: metaScore < 7 ? 'Optimise your meta title (20-70 chars) and description (50-160 chars) with clear business keywords.' : '',
  });
  if (metaScore < 7) recommendations.push('Improve meta title (20-70 chars) and description (50-160 chars).');

  // 3. H1 heading
  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1Count = h1Matches.length;
  const h1Score = h1Count === 1 ? 10 : h1Count > 1 ? 6 : 0;
  checks.push({
    name: 'H1 Heading',
    key: 'h1',
    score: h1Score,
    maxScore: 10,
    passed: h1Score >= 6,
    details: h1Count === 1 ? 'Single H1 found (ideal)' : h1Count > 1 ? `${h1Count} H1 tags found (should be 1)` : 'No H1 heading found',
    recommendation: h1Score < 6 ? 'Add a single, descriptive H1 heading that clearly states what your business does.' : '',
  });
  if (h1Score < 6) recommendations.push('Add a clear H1 heading describing your business.');

  // 4. Mobile viewport meta tag
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  const viewportScore = hasViewport ? 10 : 0;
  checks.push({
    name: 'Mobile Viewport',
    key: 'viewport',
    score: viewportScore,
    maxScore: 10,
    passed: hasViewport,
    details: hasViewport ? 'Viewport meta tag present' : 'No viewport meta tag found',
    recommendation: !hasViewport ? 'Add a viewport meta tag for mobile-friendly rendering.' : '',
  });
  if (!hasViewport) recommendations.push('Add <meta name="viewport" content="width=device-width, initial-scale=1">.');

  // 5. SSL (https)
  const isHttps = url.startsWith('https://');
  const sslScore = isHttps ? 10 : 0;
  checks.push({
    name: 'SSL Certificate (HTTPS)',
    key: 'ssl',
    score: sslScore,
    maxScore: 10,
    passed: isHttps,
    details: isHttps ? 'Site uses HTTPS' : 'Site does not use HTTPS',
    recommendation: !isHttps ? 'Switch to HTTPS — AI models and search engines heavily penalise insecure sites.' : '',
  });
  if (!isHttps) recommendations.push('Enable HTTPS on your website.');

  // 6. Page load speed (estimated from HTML size — true speed requires browser)
  const htmlSize = Buffer.byteLength(html, 'utf8');
  const sizeKb = Math.round(htmlSize / 1024);
  const speedScore = sizeKb < 100 ? 10 : sizeKb < 200 ? 8 : sizeKb < 500 ? 5 : sizeKb < 1000 ? 3 : 1;
  checks.push({
    name: 'Page Weight',
    key: 'speed',
    score: speedScore,
    maxScore: 10,
    passed: speedScore >= 5,
    details: `HTML size: ${sizeKb}KB${speedScore >= 8 ? ' (lightweight)' : speedScore >= 5 ? ' (acceptable)' : ' (heavy)'}`,
    recommendation: speedScore < 5 ? 'Reduce HTML page size — heavy pages load slowly and score worse with AI crawlers.' : '',
  });
  if (speedScore < 5) recommendations.push('Reduce page weight for faster loading.');

  // 7. Social media links
  const socialPatterns = [
    { name: 'Facebook', pattern: /facebook\.com\//i },
    { name: 'Twitter/X', pattern: /(?:twitter|x)\.com\//i },
    { name: 'LinkedIn', pattern: /linkedin\.com\//i },
    { name: 'Instagram', pattern: /instagram\.com\//i },
    { name: 'YouTube', pattern: /youtube\.com\//i },
  ];
  const foundSocials = socialPatterns.filter(s => s.pattern.test(html)).map(s => s.name);
  const socialScore = foundSocials.length >= 4 ? 10 : foundSocials.length >= 3 ? 8 : foundSocials.length >= 2 ? 5 : foundSocials.length === 1 ? 3 : 0;
  checks.push({
    name: 'Social Media Links',
    key: 'social',
    score: socialScore,
    maxScore: 10,
    passed: socialScore >= 5,
    details: foundSocials.length > 0 ? `Found: ${foundSocials.join(', ')}` : 'No social media links detected',
    recommendation: socialScore < 5 ? 'Add links to your social media profiles — AI models cross-reference multiple sources.' : '',
  });
  if (socialScore < 5) recommendations.push('Add social media profile links to your website.');

  // 8. Contact information
  const hasPhone = /(?:tel:|phone|call\s*us|[\+]?[\d\s\-()]{10,})/i.test(html);
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(html);
  const hasAddress = /(?:address|street|postcode|zip|road|avenue|lane|drive|court)/i.test(html);
  const contactCount = [hasPhone, hasEmail, hasAddress].filter(Boolean).length;
  const contactScore = contactCount === 3 ? 10 : contactCount === 2 ? 7 : contactCount === 1 ? 4 : 0;
  checks.push({
    name: 'Contact Information',
    key: 'contact',
    score: contactScore,
    maxScore: 10,
    passed: contactScore >= 7,
    details: `Phone: ${hasPhone ? 'yes' : 'no'}, Email: ${hasEmail ? 'yes' : 'no'}, Address: ${hasAddress ? 'yes' : 'no'}`,
    recommendation: contactScore < 7 ? 'Display phone, email, and address prominently — AI uses these to verify your business is real.' : '',
  });
  if (contactScore < 7) recommendations.push('Show your phone number, email, and physical address on the page.');

  // 9. FAQ section or FAQPage schema
  const hasFaqSchema = /FAQPage/i.test(html);
  const hasFaqSection = /<(section|div)[^>]*(?:class|id)=["'][^"']*faq[^"']*["']/i.test(html)
    || /<h[1-6][^>]*>.*?(?:FAQ|frequently\s+asked\s+questions)/i.test(html);
  const faqScore = hasFaqSchema ? 10 : hasFaqSection ? 6 : 0;
  checks.push({
    name: 'FAQ Section',
    key: 'faq',
    score: faqScore,
    maxScore: 10,
    passed: faqScore >= 6,
    details: hasFaqSchema ? 'FAQPage schema detected' : hasFaqSection ? 'FAQ section found (add FAQPage schema for full marks)' : 'No FAQ section or FAQPage schema found',
    recommendation: faqScore < 6 ? 'Add an FAQ section with FAQPage schema — AI assistants directly pull answers from FAQs.' : '',
  });
  if (faqScore < 6) recommendations.push('Add an FAQ section with FAQPage structured data.');

  // 10. Content length
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = textContent.split(/\s+/).length;
  const contentScore = wordCount >= 1000 ? 10 : wordCount >= 500 ? 8 : wordCount >= 300 ? 5 : wordCount >= 100 ? 3 : 1;
  checks.push({
    name: 'Content Length',
    key: 'content',
    score: contentScore,
    maxScore: 10,
    passed: contentScore >= 5,
    details: `Approximately ${wordCount} words${contentScore >= 8 ? ' (good depth)' : contentScore >= 5 ? ' (acceptable)' : ' (thin content)'}`,
    recommendation: contentScore < 5 ? 'Add more written content (500+ words) so AI models have enough context to understand your offering.' : '',
  });
  if (contentScore < 5) recommendations.push('Write more page content (aim for 500+ words).');

  const overallScore = checks.reduce((sum, c) => sum + c.score, 0);

  // Detect TendorAI schema — scan JSON-LD blocks for tendorai.com and check for script tag
  let tendoraiSchemaDetected = false;
  for (const match of ldJsonMatches) {
    if (/tendorai\.com/i.test(match)) {
      tendoraiSchemaDetected = true;
      break;
    }
  }
  if (!tendoraiSchemaDetected) {
    tendoraiSchemaDetected = /api\.tendorai\.com\/api\/schema\//i.test(html) ||
      /src=["'][^"']*tendorai\.com[^"']*schema/i.test(html);
  }

  return { overallScore, checks, recommendations, tendoraiSchemaDetected };
}

/**
 * POST /api/aeo-audit
 * Run an AEO audit on the vendor's website
 */
router.post('/', vendorAuth, async (req, res) => {
  try {
    let { websiteUrl } = req.body;
    if (!websiteUrl || typeof websiteUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'websiteUrl is required' });
    }

    websiteUrl = websiteUrl.trim();
    if (!/^https?:\/\//i.test(websiteUrl)) {
      websiteUrl = 'https://' + websiteUrl;
    }

    try {
      new URL(websiteUrl);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    // Rate limit check
    const vendor = await Vendor.findById(req.vendor.id).lean();
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const vendorTier = vendor.tier || vendor.account?.tier || 'free';
    const isPaid = PAID_TIERS.includes(vendorTier.toLowerCase());

    if (isPaid) {
      // Paid: 1 audit per 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recent = await AeoAudit.findOne({
        vendorId: req.vendor.id,
        createdAt: { $gte: sevenDaysAgo },
      }).lean();

      if (recent) {
        const nextAvailable = new Date(recent.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        return res.status(429).json({
          success: false,
          limited: true,
          message: 'You can run one AEO audit per week.',
          nextAvailable: nextAvailable.toISOString(),
        });
      }
    } else {
      // Free: 1 audit ever
      const existing = await AeoAudit.findOne({ vendorId: req.vendor.id }).lean();
      if (existing) {
        return res.status(429).json({
          success: false,
          limited: true,
          message: 'Free accounts can run one AEO audit. Upgrade to run weekly audits.',
          upgradeUrl: '/vendor-dashboard/settings?tab=subscription',
        });
      }
    }

    // Fetch the page
    let html;
    try {
      const response = await axios.get(websiteUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'TendorAI-AEO-Audit/1.0',
          'Accept': 'text/html',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });
      html = response.data;
    } catch (fetchError) {
      const msg = fetchError.code === 'ECONNABORTED'
        ? 'Website took too long to respond (15s timeout).'
        : fetchError.response
          ? `Website returned HTTP ${fetchError.response.status}.`
          : 'Could not reach the website. Check the URL and try again.';
      return res.status(422).json({ success: false, error: msg });
    }

    if (typeof html !== 'string') {
      return res.status(422).json({ success: false, error: 'Website did not return HTML content.' });
    }

    // Run analysis
    const { overallScore, checks, recommendations, tendoraiSchemaDetected } = analyseAeoSignals(html, websiteUrl);

    // Save audit
    const audit = await AeoAudit.create({
      vendorId: req.vendor.id,
      websiteUrl,
      overallScore,
      checks,
      recommendations,
      tendoraiSchemaDetected,
    });

    res.json({
      success: true,
      data: {
        id: audit._id,
        websiteUrl: audit.websiteUrl,
        overallScore: audit.overallScore,
        checks: audit.checks,
        recommendations: audit.recommendations,
        tendoraiSchemaDetected: audit.tendoraiSchemaDetected,
        createdAt: audit.createdAt,
      },
    });
  } catch (error) {
    console.error('AEO Audit error:', error);
    res.status(500).json({ success: false, error: 'Failed to run AEO audit.' });
  }
});

/**
 * GET /api/aeo-audit/latest
 * Fetch the most recent audit for the vendor, plus a canRunAgain flag
 */
router.get('/latest', vendorAuth, async (req, res) => {
  try {
    const audit = await AeoAudit.findOne({ vendorId: req.vendor.id })
      .sort({ createdAt: -1 })
      .lean();

    if (!audit) {
      return res.json({ success: true, data: null, canRunAgain: true });
    }

    // Determine if vendor can run again
    const vendor = await Vendor.findById(req.vendor.id).select('tier account').lean();
    const vendorTier = vendor?.tier || vendor?.account?.tier || 'free';
    const isPaid = PAID_TIERS.includes(vendorTier.toLowerCase());

    let canRunAgain = false;
    let nextAvailable = null;

    if (isPaid) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      canRunAgain = new Date(audit.createdAt) < sevenDaysAgo;
      if (!canRunAgain) {
        nextAvailable = new Date(new Date(audit.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
    } else {
      canRunAgain = false; // free tier already used their one audit
    }

    res.json({
      success: true,
      data: {
        id: audit._id,
        websiteUrl: audit.websiteUrl,
        overallScore: audit.overallScore,
        checks: audit.checks,
        recommendations: audit.recommendations,
        tendoraiSchemaDetected: audit.tendoraiSchemaDetected || false,
        createdAt: audit.createdAt,
      },
      canRunAgain,
      nextAvailable,
      tier: vendorTier,
    });
  } catch (error) {
    console.error('AEO Audit latest error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch latest audit.' });
  }
});

/**
 * GET /api/aeo-audit/history
 * Last 10 audits (id, url, score, date)
 */
router.get('/history', vendorAuth, async (req, res) => {
  try {
    const audits = await AeoAudit.find({ vendorId: req.vendor.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('websiteUrl overallScore createdAt')
      .lean();

    res.json({
      success: true,
      data: audits.map(a => ({
        id: a._id,
        websiteUrl: a.websiteUrl,
        overallScore: a.overallScore,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error('AEO Audit history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit history.' });
  }
});

export default router;
