/**
 * AEO Visibility Report PDF Generator
 *
 * Generates a 6-page A4 PDF report using pdf-lib.
 * Pages: Cover, What AI Knows, Competitors, Gaps, The Shift, CTA
 */

import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFArray, PDFDict, PDFNumber } from 'pdf-lib';

// Brand colours
const BLUE = rgb(0.106, 0.31, 0.447);       // #1B4F72
const RED = rgb(0.753, 0.224, 0.169);        // #C0392B
const AMBER = rgb(0.831, 0.533, 0.059);      // #D4880F
const DARK = rgb(0.11, 0.11, 0.11);          // #1C1C1C
const GREY = rgb(0.333, 0.333, 0.333);       // #555555
const LIGHT_BG = rgb(0.941, 0.957, 0.973);   // #F0F4F8
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.133, 0.545, 0.133);      // #228B22
const LIGHT_GREY = rgb(0.85, 0.85, 0.85);

// Professional service categories (solicitors, accountants, mortgage advisors, estate agents)
const PROFESSIONAL_CATEGORIES = new Set([
  'conveyancing', 'family-law', 'criminal-law', 'commercial-law',
  'employment-law', 'wills-and-probate', 'immigration', 'personal-injury',
  'tax-advisory', 'audit-assurance', 'bookkeeping', 'payroll',
  'corporate-finance', 'business-advisory', 'vat-services', 'financial-planning',
  'residential-mortgages', 'buy-to-let', 'remortgage', 'first-time-buyer',
  'equity-release', 'commercial-mortgages', 'protection-insurance',
  'sales', 'lettings', 'property-management', 'block-management',
  'auctions', 'commercial-property', 'inventory',
]);

const MORTGAGE_CATEGORIES = new Set([
  'residential-mortgages', 'buy-to-let', 'remortgage', 'first-time-buyer',
  'equity-release', 'commercial-mortgages', 'protection-insurance',
]);

const ESTATE_CATEGORIES = new Set([
  'sales', 'lettings', 'property-management', 'block-management',
  'auctions', 'commercial-property', 'inventory',
]);

function isProfessionalCategory(cat) {
  return PROFESSIONAL_CATEGORIES.has(cat);
}

function isMortgageCategory(cat) {
  return MORTGAGE_CATEGORIES.has(cat);
}

function isEstateCategory(cat) {
  return ESTATE_CATEGORIES.has(cat);
}

/**
 * Return the right entity noun for a category.
 * solicitor cats -> 'firm' / 'firms' / 'solicitors' / 'clients'
 * mortgage cats  -> 'firm' / 'firms' / 'advisors'  / 'clients'
 * estate cats    -> 'agency' / 'agencies' / 'agents' / 'clients'
 * default        -> 'company' / 'companies' / 'suppliers' / 'buyers'
 */
function entityTerms(category) {
  if (isMortgageCategory(category)) {
    return { singular: 'firm', plural: 'firms', professional: 'mortgage advisors', customer: 'clients' };
  }
  if (isEstateCategory(category)) {
    return { singular: 'agency', plural: 'agencies', professional: 'estate agents', customer: 'clients' };
  }
  if (isProfessionalCategory(category)) {
    return { singular: 'firm', plural: 'firms', professional: 'solicitors', customer: 'clients' };
  }
  return { singular: 'company', plural: 'companies', professional: 'suppliers', customer: 'buyers' };
}

// A4 dimensions in points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Generate a PDF buffer for a full AEO report.
 * @param {Object} report - The full report data from generateFullReport
 * @returns {Buffer} PDF as a Node.js Buffer
 */
export async function generateReportPdf(report) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ctx = { pdfDoc, font, bold };

  drawCoverPage(ctx, report);
  drawWhatAiKnowsPage(ctx, report);
  drawCompetitorsPage(ctx, report);
  drawGapsPage(ctx, report);
  drawTheShiftPage(ctx, report);
  drawCtaPage(ctx, report);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addPage(ctx) {
  const page = ctx.pdfDoc.addPage([PAGE_W, PAGE_H]);
  return page;
}

function drawHeader(page, ctx) {
  page.drawRectangle({ x: 0, y: PAGE_H - 40, width: PAGE_W, height: 40, color: BLUE });
  page.drawText('TendorAI', { x: MARGIN, y: PAGE_H - 28, size: 14, font: ctx.bold, color: WHITE });
  page.drawText('AI Visibility Report', {
    x: PAGE_W - MARGIN - ctx.font.widthOfTextAtSize('AI Visibility Report', 10),
    y: PAGE_H - 26,
    size: 10,
    font: ctx.font,
    color: WHITE,
  });
}

function drawFooter(page, ctx, pageNum) {
  page.drawLine({
    start: { x: MARGIN, y: 45 },
    end: { x: PAGE_W - MARGIN, y: 45 },
    thickness: 0.5,
    color: LIGHT_GREY,
  });
  page.drawText('www.tendorai.com', { x: MARGIN, y: 30, size: 8, font: ctx.font, color: GREY });
  const pageText = `Page ${pageNum} of 6`;
  page.drawText(pageText, {
    x: PAGE_W - MARGIN - ctx.font.widthOfTextAtSize(pageText, 8),
    y: 30,
    size: 8,
    font: ctx.font,
    color: GREY,
  });
}

/**
 * Sanitize text for WinAnsi encoding (StandardFonts).
 * Replaces unsupported Unicode characters with safe equivalents.
 */
function sanitize(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\u2192\u2190\u2191\u2193]/g, '->')  // arrows
    .replace(/[\u2713\u2714\u2705]/g, 'Y')          // checkmarks
    .replace(/[\u2717\u2718\u274C]/g, 'X')           // crosses
    .replace(/[\u2022\u2023\u25CF]/g, '*')            // bullets beyond basic
    .replace(/[\u201C\u201D]/g, '"')                  // smart double quotes
    .replace(/[\u2018\u2019]/g, "'")                  // smart single quotes
    .replace(/[\u2026]/g, '...')                       // ellipsis
    .replace(/[\u2013]/g, '-')                         // en dash
    // Keep em dash (0x2014 = \u2014), bullet (0x2022), pound (0x00A3) — these ARE in WinAnsi
    // Strip anything else above 0xFF that's not in WinAnsi
    .replace(/[^\x00-\xFF\u2014\u2022\u00A3\u00A9\u00AE\u00B0\u00B7]/g, '');
}

/**
 * Wrap text into lines that fit within maxWidth.
 */
function wrapText(text, font, fontSize, maxWidth) {
  const words = sanitize(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Draw wrapped text and return the new Y position.
 */
function drawWrappedText(page, text, x, y, font, fontSize, color, maxWidth, lineHeight) {
  const lines = wrapText(text, font, fontSize, maxWidth);
  const lh = lineHeight || fontSize * 1.4;
  let curY = y;
  for (const line of lines) {
    if (curY < 60) break; // stop before footer
    page.drawText(line, { x, y: curY, size: fontSize, font, color });
    curY -= lh;
  }
  return curY;
}

/**
 * Add a clickable link annotation to a page.
 */
function addLinkAnnotation(page, x, y, width, height, url) {
  try {
    const context = page.doc.context;
    const annot = context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(url),
      },
    });

    const existing = page.node.get(PDFName.of('Annots'));
    if (existing) {
      const annots = context.lookup(existing);
      if (annots instanceof PDFArray) {
        annots.push(context.register(annot));
      }
    } else {
      const arr = context.obj([context.register(annot)]);
      page.node.set(PDFName.of('Annots'), arr);
    }
  } catch (e) {
    // Silently skip annotation if it fails
  }
}

function getScoreColor(score) {
  if (score <= 30) return RED;
  if (score <= 60) return AMBER;
  return BLUE;
}

function getScoreLabel(score) {
  if (score <= 20) return 'Critical';
  if (score <= 35) return 'Poor';
  if (score <= 50) return 'Below Average';
  if (score <= 65) return 'Average';
  if (score <= 80) return 'Good';
  return 'Excellent';
}

// ─── Page 1: Cover ──────────────────────────────────────────────────────────

function drawCoverPage(ctx, report) {
  const page = addPage(ctx);
  const { font, bold } = ctx;
  const isProfessional = isProfessionalCategory(report.category);
  const terms = entityTerms(report.category);

  // Full blue header band
  page.drawRectangle({ x: 0, y: PAGE_H - 120, width: PAGE_W, height: 120, color: BLUE });
  page.drawText('TendorAI', { x: MARGIN, y: PAGE_H - 50, size: 28, font: bold, color: WHITE });
  page.drawText('AI Visibility Report', { x: MARGIN, y: PAGE_H - 80, size: 16, font, color: WHITE });
  page.drawText(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, {
    x: MARGIN, y: PAGE_H - 100, size: 10, font, color: rgb(0.8, 0.85, 0.9),
  });

  // Score circle
  const scoreColor = getScoreColor(report.score);
  const cx = PAGE_W / 2;
  const cy = PAGE_H - 260;
  const radius = 70;

  // Circle border
  page.drawCircle({ x: cx, y: cy, size: radius, borderColor: scoreColor, borderWidth: 6, color: WHITE });

  // Score number (centered)
  const scoreStr = String(report.score);
  const scoreW = bold.widthOfTextAtSize(scoreStr, 48);
  page.drawText(scoreStr, { x: cx - scoreW / 2, y: cy - 12, size: 48, font: bold, color: scoreColor });

  // "out of 100"
  const outOf = 'out of 100';
  const outOfW = font.widthOfTextAtSize(outOf, 11);
  page.drawText(outOf, { x: cx - outOfW / 2, y: cy - 30, size: 11, font, color: GREY });

  // Score label
  const label = getScoreLabel(report.score);
  const labelW = bold.widthOfTextAtSize(label, 14);
  page.drawText(label, { x: cx - labelW / 2, y: cy - radius - 25, size: 14, font: bold, color: scoreColor });

  // Industry average context
  if (report.industryAverage) {
    const avgText = `The average UK ${report.industryTypeLabel} scores ${report.industryAverage}. Top-performing businesses score 70+.`;
    const avgW = font.widthOfTextAtSize(avgText, 10);
    page.drawText(avgText, { x: cx - avgW / 2, y: cy - radius - 45, size: 10, font, color: GREY });
  }

  // Company info
  let y = cy - radius - (report.industryAverage ? 90 : 65);
  const companyNameStr = sanitize(report.companyName || 'Unknown Company');
  const nameW = bold.widthOfTextAtSize(companyNameStr, 22);
  page.drawText(companyNameStr, { x: cx - nameW / 2, y, size: 22, font: bold, color: DARK });

  y -= 25;
  const categoryLabel = {
    // Office equipment
    copiers: 'Photocopiers & Managed Print',
    telecoms: 'Business Telecoms & VoIP',
    cctv: 'CCTV & Security Systems',
    it: 'IT Support & Managed Services',
    // Solicitors
    conveyancing: 'Conveyancing',
    'family-law': 'Family Law',
    'criminal-law': 'Criminal Law',
    'commercial-law': 'Commercial Law',
    'employment-law': 'Employment Law',
    'wills-and-probate': 'Wills & Probate',
    immigration: 'Immigration',
    'personal-injury': 'Personal Injury',
    // Accountants
    'tax-advisory': 'Tax Advisory',
    'audit-assurance': 'Audit & Assurance',
    bookkeeping: 'Bookkeeping',
    payroll: 'Payroll Services',
    'corporate-finance': 'Corporate Finance',
    'business-advisory': 'Business Advisory',
    'vat-services': 'VAT Services',
    'financial-planning': 'Financial Planning',
    // Mortgage advisors
    'residential-mortgages': 'Residential Mortgages',
    'buy-to-let': 'Buy-to-Let Mortgages',
    remortgage: 'Remortgage',
    'first-time-buyer': 'First-Time Buyer Mortgages',
    'equity-release': 'Equity Release',
    'commercial-mortgages': 'Commercial Mortgages',
    'protection-insurance': 'Protection Insurance',
    // Estate agents
    sales: 'Property Sales',
    lettings: 'Lettings',
    'property-management': 'Property Management',
    'block-management': 'Block Management',
    auctions: 'Property Auctions',
    'commercial-property': 'Commercial Property',
    inventory: 'Inventory Services',
  }[report.category] || report.category;
  if (report.category === 'other' && report.customIndustry) categoryLabel = report.customIndustry;
  const catCity = `${categoryLabel} — ${report.city}`;
  const catCityW = font.widthOfTextAtSize(catCity, 12);
  page.drawText(catCity, { x: cx - catCityW / 2, y, size: 12, font, color: GREY });

  // Alarming headline
  y -= 55;
  const headline = report.aiMentioned
    ? 'AI mentions you — but your competitors rank higher.'
    : 'AI is NOT recommending your business.';
  const headlineW = bold.widthOfTextAtSize(headline, 16);
  page.drawText(headline, { x: cx - headlineW / 2, y, size: 16, font: bold, color: RED });

  y -= 25;
  const subhead = report.aiMentioned
    ? `You appear at position ${report.aiPosition || '?'}, but ${report.competitors?.length || 0} competitors rank ahead or alongside you.`
    : `When ${terms.customer} ask AI for ${categoryLabel.toLowerCase()} ${terms.professional} in ${report.city}, you don't appear. Here's who does.`;
  drawWrappedText(page, subhead, MARGIN + 20, y, font, 11, GREY, CONTENT_W - 40, 16);

  // Key stats bar at bottom
  y = 140;
  page.drawRectangle({ x: MARGIN, y: y - 10, width: CONTENT_W, height: 60, color: LIGHT_BG });

  const stats = [
    { label: 'Your Score', value: `${report.score}/100` },
    { label: 'Competitors Found', value: String(report.competitors?.length || 0) },
    { label: 'On TendorAI', value: String(report.competitorsOnTendorAI || 0) },
    { label: 'Gaps Identified', value: String(report.gaps?.length || 0) },
  ];
  const statW = CONTENT_W / stats.length;
  stats.forEach((s, i) => {
    const sx = MARGIN + i * statW + statW / 2;
    const valW = bold.widthOfTextAtSize(s.value, 18);
    page.drawText(s.value, { x: sx - valW / 2, y: y + 22, size: 18, font: bold, color: BLUE });
    const labW = font.widthOfTextAtSize(s.label, 8);
    page.drawText(s.label, { x: sx - labW / 2, y: y + 5, size: 8, font, color: GREY });
  });

  drawFooter(page, ctx, 1);
}

// ─── Page 2: What AI Knows ──────────────────────────────────────────────────

function drawWhatAiKnowsPage(ctx, report) {
  const page = addPage(ctx);
  drawHeader(page, ctx);
  const { font, bold } = ctx;
  const sc = report.searchedCompany || {};
  const isProfessional = isProfessionalCategory(report.category);
  const terms = entityTerms(report.category);

  let y = PAGE_H - 75;
  page.drawText('What AI Knows About You', { x: MARGIN, y, size: 20, font: bold, color: DARK });

  y -= 15;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLUE });

  y -= 25;
  y = drawWrappedText(page, sc.summary || `Limited information was found about your ${terms.singular} online.`, MARGIN, y, font, 11, GREY, CONTENT_W, 16);

  y -= 20;
  page.drawText('AI Visibility Checklist', { x: MARGIN, y, size: 14, font: bold, color: DARK });

  let checks;
  if (isMortgageCategory(report.category)) {
    checks = [
      { label: 'Firm Website Found', value: !!sc.website, detail: sc.website || 'No website found' },
      { label: 'Client Reviews Visible', value: !!sc.hasReviews, detail: sc.hasReviews ? 'Reviews found online' : 'No reviews found on Google, VouchedFor, Unbiased, etc.' },
      { label: 'Fee Transparency', value: !!sc.hasPricing, detail: sc.hasPricing ? 'Broker fees and commission disclosure visible' : 'No fee or commission information found' },
      { label: 'FCA Register Listing', value: !!sc.hasBrands, detail: sc.hasBrands ? 'FCA registration number visible' : 'No FCA register reference found' },
      { label: 'CeMAP / CII Qualifications', value: !!sc.hasDetailedServices, detail: sc.hasDetailedServices ? 'Adviser qualifications listed' : 'No adviser qualifications visible on site' },
      { label: 'Lender Panel Disclosure', value: !!sc.hasBrands, detail: sc.hasBrands ? 'Lender panel details visible' : 'No lender panel information listed (whole of market vs tied)' },
      { label: 'Structured Data (Schema.org)', value: !!sc.hasStructuredData, detail: sc.hasStructuredData ? 'FinancialService schema markup detected' : 'No structured data found — AI cannot easily parse your site' },
      { label: 'Social Media Presence', value: !!sc.hasSocialMedia, detail: sc.hasSocialMedia ? 'Active social profiles found' : 'No active social media profiles found' },
      { label: 'Google Business Profile', value: !!sc.hasGoogleBusiness, detail: sc.hasGoogleBusiness ? 'Google Business listing found' : 'No Google Business Profile detected' },
    ];
  } else if (isEstateCategory(report.category)) {
    checks = [
      { label: 'Agency Website Found', value: !!sc.website, detail: sc.website || 'No website found' },
      { label: 'Client Reviews Visible', value: !!sc.hasReviews, detail: sc.hasReviews ? 'Reviews found online' : 'No reviews found on Google, AllAgents, Trustpilot, etc.' },
      { label: 'Fee / Commission Information', value: !!sc.hasPricing, detail: sc.hasPricing ? 'Fee or commission structure visible' : 'No fee information found' },
      { label: 'Propertymark / ARLA / NAEA', value: !!sc.hasBrands, detail: sc.hasBrands ? 'Industry membership visible' : 'No Propertymark, ARLA, or NAEA membership listed' },
      { label: 'Portal Listings (Rightmove/Zoopla)', value: !!sc.hasDetailedServices, detail: sc.hasDetailedServices ? 'Active portal listings detected' : 'No Rightmove or Zoopla presence found' },
      { label: 'Client Money Protection', value: !!sc.hasBrands, detail: sc.hasBrands ? 'CMP scheme membership visible' : 'No Client Money Protection information listed' },
      { label: 'Structured Data (Schema.org)', value: !!sc.hasStructuredData, detail: sc.hasStructuredData ? 'RealEstateAgent schema markup detected' : 'No structured data found — AI cannot easily parse your site' },
      { label: 'Social Media Presence', value: !!sc.hasSocialMedia, detail: sc.hasSocialMedia ? 'Active social profiles found' : 'No active social media profiles found' },
      { label: 'Google Business Profile', value: !!sc.hasGoogleBusiness, detail: sc.hasGoogleBusiness ? 'Google Business listing found' : 'No Google Business Profile detected' },
    ];
  } else if (isProfessional) {
    checks = [
      { label: 'Firm Website Found', value: !!sc.website, detail: sc.website || 'No website found' },
      { label: 'Client Reviews Visible', value: !!sc.hasReviews, detail: sc.hasReviews ? 'Reviews found online' : 'No reviews found on Google, ReviewSolicitors, etc.' },
      { label: 'Fee Information', value: !!sc.hasPricing, detail: sc.hasPricing ? 'Fee estimates or fixed fees visible' : 'No fee information found' },
      { label: 'Accreditations & Qualifications', value: !!sc.hasBrands, detail: sc.hasBrands ? 'SRA, Law Society, Lexcel, CQS visible' : 'No accreditations or quality marks listed' },
      { label: 'Structured Data (Schema.org)', value: !!sc.hasStructuredData, detail: sc.hasStructuredData ? 'LegalService schema markup detected' : 'No structured data found — AI cannot easily parse your site' },
      { label: 'Detailed Practice Area Pages', value: !!sc.hasDetailedServices, detail: sc.hasDetailedServices ? 'Practice area pages with process detail' : 'Vague or missing practice area descriptions' },
      { label: 'Social Media Presence', value: !!sc.hasSocialMedia, detail: sc.hasSocialMedia ? 'Active social profiles found' : 'No active social media profiles found' },
      { label: 'Google Business Profile', value: !!sc.hasGoogleBusiness, detail: sc.hasGoogleBusiness ? 'Google Business listing found' : 'No Google Business Profile detected' },
    ];
  } else {
    checks = [
      { label: 'Company Website Found', value: !!sc.website, detail: sc.website || 'No website found' },
      { label: 'Customer Reviews Visible', value: !!sc.hasReviews, detail: sc.hasReviews ? 'Reviews found online' : 'No reviews found on Google, Trustpilot, etc.' },
      { label: 'Pricing Information', value: !!sc.hasPricing, detail: sc.hasPricing ? 'Pricing visible on website' : 'No pricing information found' },
      { label: 'Brand Partnerships Listed', value: !!sc.hasBrands, detail: sc.hasBrands ? 'Manufacturer partnerships visible' : 'No brand partnerships listed' },
      { label: 'Structured Data (Schema.org)', value: !!sc.hasStructuredData, detail: sc.hasStructuredData ? 'Schema markup detected' : 'No structured data found — AI cannot easily parse your site' },
      { label: 'Detailed Service Pages', value: !!sc.hasDetailedServices, detail: sc.hasDetailedServices ? 'Service pages with detail' : 'Vague or missing service descriptions' },
      { label: 'Social Media Presence', value: !!sc.hasSocialMedia, detail: sc.hasSocialMedia ? 'Active social profiles found' : 'No active social media profiles found' },
      { label: 'Google Business Profile', value: !!sc.hasGoogleBusiness, detail: sc.hasGoogleBusiness ? 'Google Business listing found' : 'No Google Business Profile detected' },
    ];
  }

  y -= 25;
  for (const check of checks) {
    if (y < 100) break;

    // Indicator
    const indicator = check.value ? 'YES' : 'NO';
    const indicatorColor = check.value ? GREEN : RED;
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: 36,
      height: 18,
      color: indicatorColor,
      borderColor: indicatorColor,
      borderWidth: 0,
    });
    const indW = bold.widthOfTextAtSize(indicator, 8);
    page.drawText(indicator, { x: MARGIN + 18 - indW / 2, y: y, size: 8, font: bold, color: WHITE });

    // Label
    page.drawText(sanitize(check.label), { x: MARGIN + 46, y: y, size: 11, font: bold, color: DARK });

    // Detail
    y -= 16;
    page.drawText(sanitize(check.detail), { x: MARGIN + 46, y: y, size: 9, font, color: GREY });

    y -= 25;
  }

  // SEO vs AEO education section
  if (y > 350) {
    y -= 10;
    const eduBoxH = 170;
    page.drawRectangle({ x: MARGIN, y: y - eduBoxH + 15, width: CONTENT_W, height: eduBoxH, color: LIGHT_BG });

    page.drawText('Why Your SEO Score Doesn\'t Tell the Full Story', { x: MARGIN + 12, y, size: 12, font: bold, color: DARK });
    y -= 18;

    const eduParagraphs = [
      'Your website may perform well on traditional SEO audits -- but that no longer guarantees visibility. SEO measures how Google indexes your site. AEO (Answer Engine Optimisation) measures whether AI actually recommends you.',
      'AI recommendation engines like ChatGPT, Perplexity, and Claude don\'t just crawl your site -- they evaluate structured data, authority signals, verified profiles, and review sentiment to decide who to recommend.',
      'A business can score 70+ on a website SEO audit and still score under 20 on AI visibility, because the signals AI uses are fundamentally different from what traditional SEO tools measure.',
    ];
    for (const para of eduParagraphs) {
      y = drawWrappedText(page, para, MARGIN + 12, y, font, 9, GREY, CONTENT_W - 24, 13);
      y -= 6;
    }

    const emphText = 'This report measures what matters now: whether AI recommends you.';
    y = drawWrappedText(page, emphText, MARGIN + 12, y, bold, 9, DARK, CONTENT_W - 24, 13);
    y -= 15;
  }

  // Score breakdown
  if (y > 200) {
    y -= 15;
    page.drawText('Score Breakdown', { x: MARGIN, y, size: 14, font: bold, color: DARK });
    y -= 25;

    const breakdown = report.scoreBreakdown || {};
    const items = [
      { label: 'Website Optimisation', score: breakdown.websiteOptimisation || 0 },
      { label: 'Content Authority', score: breakdown.contentAuthority || 0 },
      { label: 'Directory Presence', score: breakdown.directoryPresence || 0 },
      { label: 'Review Signals', score: breakdown.reviewSignals || 0 },
      { label: 'Structured Data', score: breakdown.structuredData || 0 },
      { label: 'Competitive Position', score: breakdown.competitivePosition || 0 },
    ];

    for (const item of items) {
      if (y < 80) break;
      page.drawText(item.label, { x: MARGIN, y, size: 10, font, color: DARK });

      // Bar background
      const barX = MARGIN + 160;
      const barW = 200;
      const barH = 10;
      page.drawRectangle({ x: barX, y: y - 1, width: barW, height: barH, color: LIGHT_BG });

      // Bar fill
      const fillW = (item.score / 17) * barW;
      const barColor = item.score <= 5 ? RED : item.score <= 10 ? AMBER : BLUE;
      page.drawRectangle({ x: barX, y: y - 1, width: fillW, height: barH, color: barColor });

      // Score text
      page.drawText(`${item.score}/17`, {
        x: barX + barW + 10,
        y,
        size: 10,
        font: bold,
        color: barColor,
      });

      y -= 22;
    }
  }

  drawFooter(page, ctx, 2);
}

// ─── Page 3: Competitors ────────────────────────────────────────────────────

function drawCompetitorsPage(ctx, report) {
  const page = addPage(ctx);
  drawHeader(page, ctx);
  const { font, bold } = ctx;

  let y = PAGE_H - 75;
  page.drawText('Who AI Recommends Instead', { x: MARGIN, y, size: 20, font: bold, color: DARK });

  y -= 15;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: RED });

  y -= 20;
  const terms = entityTerms(report.category);
  const introText = report.aiMentioned
    ? `When ${terms.customer} ask AI for ${report.category} ${terms.professional} in ${report.city}, these ${terms.plural} appear alongside or ahead of you:`
    : `When ${terms.customer} ask AI for ${report.category} ${terms.professional} in ${report.city}, these are the ${terms.plural} AI recommends instead of you:`;
  y = drawWrappedText(page, introText, MARGIN, y, font, 11, GREY, CONTENT_W, 16);
  y -= 15;

  const competitors = report.competitors || [];
  for (let i = 0; i < competitors.length; i++) {
    const comp = competitors[i];
    if (y < 100) break;

    // Number badge
    const num = String(i + 1);
    page.drawCircle({ x: MARGIN + 12, y: y + 2, size: 12, color: BLUE });
    const numW = bold.widthOfTextAtSize(num, 10);
    page.drawText(num, { x: MARGIN + 12 - numW / 2, y: y - 2, size: 10, font: bold, color: WHITE });

    // Company name
    page.drawText(sanitize(comp.name), { x: MARGIN + 30, y, size: 13, font: bold, color: DARK });

    // Website URL (clickable)
    if (comp.website) {
      y -= 16;
      const urlDisplay = sanitize(comp.website.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      page.drawText(urlDisplay, { x: MARGIN + 30, y, size: 9, font, color: BLUE });
      const urlW = font.widthOfTextAtSize(urlDisplay, 9);
      addLinkAnnotation(page, MARGIN + 30, y - 2, urlW, 12, comp.website);
    }

    // Description
    y -= 16;
    y = drawWrappedText(page, comp.description || '', MARGIN + 30, y, font, 10, GREY, CONTENT_W - 40, 14);

    // Strengths
    if (comp.strengths && comp.strengths.length > 0) {
      y -= 4;
      for (const strength of comp.strengths) {
        if (y < 80) break;
        page.drawText(sanitize(`-  ${strength}`), { x: MARGIN + 40, y, size: 9, font, color: DARK });
        y -= 14;
      }
    }

    y -= 15;
  }

  drawFooter(page, ctx, 3);
}

// ─── Page 4: Gaps ───────────────────────────────────────────────────────────

function drawGapsPage(ctx, report) {
  const page = addPage(ctx);
  drawHeader(page, ctx);
  const { font, bold } = ctx;
  const terms = entityTerms(report.category);

  let y = PAGE_H - 75;
  page.drawText('Your Visibility Gaps', { x: MARGIN, y, size: 20, font: bold, color: DARK });

  y -= 15;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: AMBER });

  y -= 20;
  y = drawWrappedText(
    page,
    'These are the specific reasons AI tools are not recommending your business. Each gap represents an opportunity to improve your AI visibility.',
    MARGIN, y, font, 11, GREY, CONTENT_W, 16
  );
  y -= 20;

  const gaps = report.gaps || [];
  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i];
    if (y < 100) break;

    // Gap card background
    const cardH = 70;
    page.drawRectangle({
      x: MARGIN,
      y: y - cardH + 20,
      width: CONTENT_W,
      height: cardH,
      color: LIGHT_BG,
    });

    // Warning icon / number
    page.drawText(`${i + 1}.`, { x: MARGIN + 12, y, size: 14, font: bold, color: AMBER });

    // Title
    page.drawText(sanitize(gap.title), { x: MARGIN + 35, y, size: 13, font: bold, color: DARK });

    // Explanation
    y -= 18;
    y = drawWrappedText(page, gap.explanation, MARGIN + 35, y, font, 10, GREY, CONTENT_W - 50, 14);

    y -= 25;
  }

  // "What this means" summary
  if (y > 180) {
    y -= 20;
    page.drawRectangle({ x: MARGIN, y: y - 60, width: CONTENT_W, height: 80, color: BLUE });
    page.drawText('What This Means', { x: MARGIN + 15, y: y - 2, size: 14, font: bold, color: WHITE });
    drawWrappedText(
      page,
      `With a score of ${report.score}/100, your business is largely invisible to AI recommendation engines. When potential ${terms.customer} use ChatGPT, Perplexity, or Claude to find ${report.category} ${terms.professional} in ${report.city}, they are being directed to your competitors.`,
      MARGIN + 15, y - 22, font, 10, WHITE, CONTENT_W - 30, 14
    );
  }

  drawFooter(page, ctx, 4);
}

// ─── Page 5: The Shift ─────────────────────────────────────────────────────

function drawTheShiftPage(ctx, report) {
  const page = addPage(ctx);
  drawHeader(page, ctx);
  const { font, bold } = ctx;

  let y = PAGE_H - 75;
  page.drawText('The Shift: SEO to AEO', { x: MARGIN, y, size: 20, font: bold, color: DARK });

  y -= 15;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLUE });

  y -= 25;
  const sections = [
    {
      title: 'Buyers Are Changing How They Search',
      text: 'According to Gartner, by 2026, traditional search engine volume will drop 25% as consumers shift to AI assistants. Forrester reports that 60% of B2B buyers now use AI tools to research suppliers before making contact. If your business isn\'t visible to AI, you\'re losing leads you\'ll never know about.',
    },
    {
      title: 'What is AEO?',
      text: 'Answer Engine Optimisation (AEO) is the process of making your business visible to AI recommendation engines like ChatGPT, Perplexity, Claude, and Google AI Overviews. Unlike SEO which optimises for search engine rankings, AEO focuses on structured data, authority signals, and verified profiles that AI tools use to make recommendations.',
    },
    {
      title: 'SEO vs AEO',
      text: '',
    },
  ];

  for (const section of sections) {
    if (y < 200) break;

    page.drawText(section.title, { x: MARGIN, y, size: 14, font: bold, color: DARK });
    y -= 18;

    if (section.text) {
      y = drawWrappedText(page, section.text, MARGIN, y, font, 10, GREY, CONTENT_W, 15);
      y -= 20;
    }
  }

  // SEO vs AEO comparison table
  if (y > 200) {
    const tableX = MARGIN;
    const col1W = 160;
    const col2W = (CONTENT_W - col1W) / 2;
    const rowH = 24;

    // Header row
    page.drawRectangle({ x: tableX, y: y - rowH + 10, width: CONTENT_W, height: rowH, color: BLUE });
    page.drawText('', { x: tableX + 10, y: y - 5, size: 9, font: bold, color: WHITE });
    page.drawText('Traditional SEO', { x: tableX + col1W + 10, y: y - 5, size: 9, font: bold, color: WHITE });
    page.drawText('AEO (AI Optimisation)', { x: tableX + col1W + col2W + 10, y: y - 5, size: 9, font: bold, color: WHITE });
    y -= rowH;

    const rows = [
      ['Goal', 'Rank on Google page 1', 'Be recommended by AI'],
      ['Format', 'Blue links & snippets', 'Conversational answers'],
      ['Key Factor', 'Backlinks & keywords', 'Structured data & authority'],
      ['Visibility', 'Search results page', 'AI chat responses'],
      ['User Intent', 'Browse multiple results', 'Trust single AI answer'],
      ['Timeline', 'Established since 1990s', 'Emerging since 2023'],
    ];

    for (const row of rows) {
      if (y < 100) break;
      const bgColor = rows.indexOf(row) % 2 === 0 ? LIGHT_BG : WHITE;
      page.drawRectangle({ x: tableX, y: y - rowH + 10, width: CONTENT_W, height: rowH, color: bgColor });
      page.drawText(row[0], { x: tableX + 10, y: y - 5, size: 9, font: bold, color: DARK });
      page.drawText(row[1], { x: tableX + col1W + 10, y: y - 5, size: 9, font, color: GREY });
      page.drawText(row[2], { x: tableX + col1W + col2W + 10, y: y - 5, size: 9, font: bold, color: BLUE });
      y -= rowH;
    }

    y -= 20;

    // Timeline
    if (y > 120) {
      page.drawText('The AI Adoption Timeline', { x: MARGIN, y, size: 14, font: bold, color: DARK });
      y -= 20;

      const timeline = [
        { year: '2023', event: 'ChatGPT reaches 100M users — AI search goes mainstream' },
        { year: '2024', event: 'Google launches AI Overviews — traditional SEO starts declining' },
        { year: '2025', event: 'AI assistants become primary research tool for B2B buyers' },
        { year: '2026', event: 'Businesses without AI visibility lose 25%+ of inbound leads' },
      ];

      for (const item of timeline) {
        if (y < 80) break;
        page.drawText(item.year, { x: MARGIN + 5, y, size: 11, font: bold, color: BLUE });
        page.drawText(item.event, { x: MARGIN + 50, y, size: 10, font, color: DARK });
        y -= 20;
      }
    }
  }

  drawFooter(page, ctx, 5);
}

// ─── Page 6: CTA ────────────────────────────────────────────────────────────

function drawCtaPage(ctx, report) {
  const page = addPage(ctx);
  drawHeader(page, ctx);
  const { font, bold } = ctx;

  let y = PAGE_H - 75;
  page.drawText('Fix Your AI Visibility with TendorAI', { x: MARGIN, y, size: 20, font: bold, color: DARK });

  y -= 15;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLUE });

  y -= 25;
  y = drawWrappedText(
    page,
    'TendorAI is the UK\'s first AI-optimised supplier directory. We make your business visible to ChatGPT, Perplexity, Claude, and Google AI Overviews — so when buyers search, you get recommended.',
    MARGIN, y, font, 11, GREY, CONTENT_W, 16
  );

  // Features list
  y -= 25;
  page.drawText('What You Get', { x: MARGIN, y, size: 14, font: bold, color: DARK });
  y -= 20;

  const features = [
    'AI-Optimised Vendor Profile — structured data that AI tools can read and recommend',
    'Weekly AI Mention Scanning — track whether AI recommends you and your position',
    'AEO Audit Tool — check your website\'s AI readiness with 10-point analysis',
    'Competitor Intelligence — see who AI recommends in your area',
    'Review Collection — gather verified reviews that boost AI trust signals',
    'Visibility Score Dashboard — track your AI visibility score over time',
    'Product/Service Listings — showcase your full range with specs',
    'Lead Generation — receive quote requests from AI-referred buyers',
  ];

  for (const feat of features) {
    if (y < 320) break;
    page.drawText('>', { x: MARGIN + 5, y, size: 11, font: bold, color: GREEN });
    y = drawWrappedText(page, feat, MARGIN + 25, y, font, 10, DARK, CONTENT_W - 30, 14);
    y -= 8;
  }

  // Pricing table
  y -= 10;
  page.drawText('Plans & Pricing', { x: MARGIN, y, size: 14, font: bold, color: DARK });
  y -= 20;

  const plans = [
    { name: 'Free', price: '\u00A30/forever', features: ['Basic AI profile', 'Category listing', 'Ranked last in results'], url: 'https://www.tendorai.com/vendor-signup' },
    { name: 'Starter', price: '\u00A3149/mo', features: ['Pricing visible to AI', 'Ranked above free profiles', 'Monthly AEO report', 'AEO Audit tool', 'Review collection'], subtext: 'Early adopter price (was \u00A3299)', url: 'https://www.tendorai.com/vendor-signup?tier=starter' },
    { name: 'Pro', price: '\u00A3299/mo', features: ['Ranked first in AI results', 'Weekly AEO reports', 'TendorAI Verified badge', 'Unlimited products', 'Competitor reports', 'Dedicated support'], subtext: 'Early adopter price (was \u00A3499)', url: 'https://www.tendorai.com/vendor-signup?tier=pro' },
  ];

  const planW = CONTENT_W / 3;
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const px = MARGIN + i * planW;
    const isHighlight = i === 2; // Pro is highlighted

    // Plan card
    const cardH = 190;
    page.drawRectangle({
      x: px + 3,
      y: y - cardH,
      width: planW - 6,
      height: cardH,
      color: isHighlight ? BLUE : LIGHT_BG,
      borderColor: isHighlight ? BLUE : LIGHT_GREY,
      borderWidth: 1,
    });

    const textColor = isHighlight ? WHITE : DARK;
    const subColor = isHighlight ? rgb(0.8, 0.85, 0.9) : GREY;

    // Plan name
    const nameW = bold.widthOfTextAtSize(plan.name, 14);
    page.drawText(plan.name, { x: px + planW / 2 - nameW / 2, y: y - 20, size: 14, font: bold, color: textColor });

    // Price
    const priceW = bold.widthOfTextAtSize(plan.price, 20);
    page.drawText(plan.price, { x: px + planW / 2 - priceW / 2, y: y - 45, size: 20, font: bold, color: textColor });

    // Early adopter subtext
    if (plan.subtext) {
      const stW = font.widthOfTextAtSize(plan.subtext, 7);
      page.drawText(plan.subtext, { x: px + planW / 2 - stW / 2, y: y - 57, size: 7, font, color: subColor });
    }

    // Features
    let fy = plan.subtext ? y - 72 : y - 65;
    for (const feat of plan.features) {
      if (fy < y - cardH + 10) break;
      const featLines = wrapText(`> ${feat}`, font, 8, planW - 24);
      for (const line of featLines) {
        page.drawText(line, { x: px + 12, y: fy, size: 8, font, color: subColor });
        fy -= 12;
      }
    }

    // Make entire card a clickable link
    addLinkAnnotation(page, px + 3, y - cardH, planW - 6, cardH, plan.url);
  }

  y -= 220;

  // CTA
  if (y > 80) {
    page.drawRectangle({ x: MARGIN, y: y - 40, width: CONTENT_W, height: 50, color: BLUE });
    const ctaText = 'Get started free at www.tendorai.com/vendor-signup';
    const ctaW = bold.widthOfTextAtSize(ctaText, 14);
    page.drawText(ctaText, { x: PAGE_W / 2 - ctaW / 2, y: y - 22, size: 14, font: bold, color: WHITE });
    addLinkAnnotation(page, MARGIN, y - 40, CONTENT_W, 50, 'https://www.tendorai.com/vendor-signup');
  }

  drawFooter(page, ctx, 6);
}
