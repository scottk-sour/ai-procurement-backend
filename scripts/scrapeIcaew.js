/**
 * ICAEW Chartered Accountant Directory Scraper for TendorAI
 *
 * Scrapes the ICAEW "Find a Chartered Accountant" directory and
 * imports UK accounting firms into MongoDB as vendorType: 'accountant'.
 *
 * Prerequisites:
 *   - MONGODB_URI in .env
 *   - puppeteer installed (npm install puppeteer)
 *
 * Usage:
 *   node scripts/scrapeIcaew.js
 *   node scripts/scrapeIcaew.js --dry-run
 *   node scripts/scrapeIcaew.js --city=bristol --limit=10
 *   node scripts/scrapeIcaew.js --dry-run --city=london --limit=5
 *   node scripts/scrapeIcaew.js --headed          (visible browser for debugging)
 */

import puppeteer from 'puppeteer';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from '../models/Vendor.js';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
const SEARCH_BASE = 'https://find.icaew.com/search';

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const HEADED = args.includes('--headed');
const CITY_ARG = args.find(a => a.startsWith('--city='));
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const SINGLE_CITY = CITY_ARG ? CITY_ARG.split('=')[1].trim() : null;
const IMPORT_LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// Rate limiting
const DELAY_BETWEEN_PAGES = 2500;   // 2.5s between search result pages
const DELAY_BETWEEN_DETAILS = 1200; // 1.2s between detail page visits
const DELAY_BETWEEN_CITIES = 3000;  // 3s between cities

// ─── UK Cities to Scrape ─────────────────────────────────────────────
const UK_CITIES = [
  // Major cities
  'London', 'Birmingham', 'Manchester', 'Leeds', 'Glasgow',
  'Liverpool', 'Bristol', 'Sheffield', 'Edinburgh', 'Leicester',
  'Coventry', 'Bradford', 'Cardiff', 'Belfast', 'Nottingham',
  'Newcastle upon Tyne', 'Sunderland', 'Brighton', 'Hull', 'Plymouth',
  'Stoke-on-Trent', 'Wolverhampton', 'Derby', 'Swansea',
  'Southampton', 'Portsmouth', 'Oxford', 'Cambridge', 'Norwich',
  'Exeter', 'York', 'Bath', 'Cheltenham', 'Chester', 'Gloucester',
  'Worcester', 'Lincoln', 'Canterbury', 'Salisbury', 'Winchester',

  // Northern England
  'Durham', 'Carlisle', 'Lancaster', 'Preston', 'Blackpool',
  'Middlesbrough', 'Darlington', 'Harrogate', 'Scarborough',
  'Doncaster', 'Rotherham', 'Barnsley', 'Wakefield', 'Huddersfield',
  'Halifax', 'Blackburn', 'Burnley', 'Bolton', 'Wigan', 'Stockport',
  'Oldham', 'Rochdale', 'Warrington', 'Crewe', 'Macclesfield',

  // Midlands
  'Stafford', 'Telford', 'Dudley', 'Walsall', 'Solihull',
  'Leamington Spa', 'Rugby', 'Nuneaton', 'Kettering', 'Corby',
  'Northampton', 'Peterborough',

  // South East
  'Reading', 'Milton Keynes', 'Luton', 'Bedford', 'Stevenage',
  'Chelmsford', 'Basildon', 'Southend-on-Sea', 'Colchester', 'Ipswich',
  'Maidstone', 'Tunbridge Wells', 'Ashford', 'Folkestone', 'Dover',
  'Crawley', 'Horsham', 'Chichester', 'Eastbourne', 'Hastings',
  'Worthing', 'Basingstoke', 'Farnborough', 'Woking', 'Guildford',
  'Reigate', 'Epsom', 'Slough', 'Watford', 'St Albans',
  'Swindon', 'Bournemouth',

  // South West
  'Taunton', 'Torquay', 'Truro',

  // London boroughs
  'Croydon', 'Bromley', 'Enfield', 'Harrow', 'Barnet',
  'Romford', 'Ilford', 'Wembley', 'Kingston upon Thames', 'Richmond',
  'Wimbledon', 'Ealing', 'Islington', 'Camden', 'Westminster',
  'City of London', 'Canary Wharf', 'Stratford',

  // Scotland
  'Aberdeen', 'Dundee', 'Inverness', 'Perth', 'Stirling',

  // Wales
  'Newport', 'Wrexham', 'Bangor', 'Aberystwyth',
];

// ─── Service Mapping ─────────────────────────────────────────────────
const SERVICE_RULES = [
  { pattern: /\baudit\b/i, mapped: 'Audit & Assurance' },
  { pattern: /\bassurance\b/i, mapped: 'Audit & Assurance' },
  { pattern: /\btax\b(?!\s*tribunal)/i, mapped: 'Tax Advisory' },
  { pattern: /\btaxation\b/i, mapped: 'Tax Advisory' },
  { pattern: /\bpersonal tax\b/i, mapped: 'Tax Advisory' },
  { pattern: /\bcorporation tax\b/i, mapped: 'Tax Advisory' },
  { pattern: /\binheritance tax\b/i, mapped: 'Tax Advisory' },
  { pattern: /\bcapital gains\b/i, mapped: 'Tax Advisory' },
  { pattern: /\bself.?assessment\b/i, mapped: 'Tax Advisory' },
  { pattern: /\bvat\b/i, mapped: 'VAT' },
  { pattern: /\bbookkeep/i, mapped: 'Bookkeeping' },
  { pattern: /\bpayroll\b/i, mapped: 'Payroll' },
  { pattern: /\baccounts?\s*preparation\b/i, mapped: 'Accounts Preparation' },
  { pattern: /\bmanagement\s*accounts?\b/i, mapped: 'Management Accounts' },
  { pattern: /\bcorporate\s*finance\b/i, mapped: 'Corporate Finance' },
  { pattern: /\binsolvency\b/i, mapped: 'Insolvency & Recovery' },
  { pattern: /\brecovery\b/i, mapped: 'Insolvency & Recovery' },
  { pattern: /\bforensic\b/i, mapped: 'Forensic Accounting' },
  { pattern: /\bfinancial\s*planning\b/i, mapped: 'Financial Planning' },
  { pattern: /\bwealth\s*management\b/i, mapped: 'Financial Planning' },
  { pattern: /\bcompany\s*secretar/i, mapped: 'Company Secretarial' },
  { pattern: /\bbusiness\s*advi/i, mapped: 'Business Advisory' },
  { pattern: /\bconsultancy\b/i, mapped: 'Business Advisory' },
  { pattern: /\bstart.?up/i, mapped: 'Business Advisory' },
  { pattern: /\bcloud\s*accounting\b/i, mapped: 'Cloud Accounting' },
  { pattern: /\bxero\b|\bsage\b|\bquickbooks\b/i, mapped: 'Cloud Accounting' },
  { pattern: /\bmerger/i, mapped: 'Corporate Finance' },
  { pattern: /\bacquisition/i, mapped: 'Corporate Finance' },
  { pattern: /\bdue\s*diligence\b/i, mapped: 'Corporate Finance' },
  { pattern: /\bestate\s*planning\b/i, mapped: 'Tax Advisory' },
  { pattern: /\btrust/i, mapped: 'Trust & Estate Planning' },
  { pattern: /\bcharit/i, mapped: 'Charity & Not-for-Profit' },
  { pattern: /\bnot.?for.?profit\b/i, mapped: 'Charity & Not-for-Profit' },
  { pattern: /\bproperty\b/i, mapped: 'Property & Real Estate' },
  { pattern: /\breal\s*estate\b/i, mapped: 'Property & Real Estate' },
  { pattern: /\binternational\b/i, mapped: 'International Services' },
  { pattern: /\bR&D\b|\bresearch\s*(and|&)\s*development\b/i, mapped: 'R&D Tax Credits' },
];

function mapServices(rawServices) {
  if (!Array.isArray(rawServices) || rawServices.length === 0) return [];
  const mapped = new Set();
  for (const svc of rawServices) {
    if (!svc || typeof svc !== 'string') continue;
    let matched = false;
    for (const rule of SERVICE_RULES) {
      if (rule.pattern.test(svc)) {
        mapped.add(rule.mapped);
        matched = true;
        // Don't break — one service string might match multiple categories
      }
    }
    if (!matched) {
      mapped.add(svc.trim());
    }
  }
  return [...mapped];
}

// ─── City Name Normalization ──────────────────────────────────────────
function normalizeCity(city) {
  if (!city) return '';
  return city.trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bUpon\b/g, 'upon')
    .replace(/\bOn\b/g, 'on')
    .replace(/\bIn\b/g, 'in')
    .replace(/\bDe\b/g, 'de')
    .replace(/\bLe\b/g, 'le')
    .replace(/\bLa\b/g, 'la')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bAnd\b/g, 'and')
    .replace(/^./, c => c.toUpperCase());
}

// ─── Slug Generation ──────────────────────────────────────────────────
function generateSlug(company, city) {
  const base = `${company} ${city || ''}`.trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

// ─── Delay helper ──────────────────────────────────────────────────
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Extract city from address ────────────────────────────────────
function extractCityFromAddress(address, searchCity) {
  if (!address) return normalizeCity(searchCity);

  // Try to find a UK postcode and use the line before it
  const lines = address.split(/[,\n]/).map(l => l.trim()).filter(Boolean);

  // If searchCity is found in address, use it
  for (const line of lines) {
    if (line.toLowerCase().includes(searchCity.toLowerCase())) {
      return normalizeCity(searchCity);
    }
  }

  // Try to extract from postcode area — the line before postcode is usually city
  const postcodeIdx = lines.findIndex(l => /^[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}$/i.test(l.trim()));
  if (postcodeIdx > 0) {
    return normalizeCity(lines[postcodeIdx - 1]);
  }

  // Fallback: use the search city
  return normalizeCity(searchCity);
}

// ─── Extract postcode from address ────────────────────────────────
function extractPostcode(address) {
  if (!address) return '';
  const match = address.match(/([A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2})/i);
  return match ? match[1].toUpperCase() : '';
}

// ─── Scrape a single search page ──────────────────────────────────
async function scrapeSearchPage(page) {
  return page.evaluate(() => {
    const firms = [];

    // Strategy 1: Look for result cards/items with links
    // ICAEW uses a React/Next.js app — try common selectors
    const resultSelectors = [
      '.search-results .result',
      '.search-results li',
      '.results-list .result-item',
      '[class*="result"] [class*="card"]',
      '[class*="SearchResult"]',
      '[class*="search-result"]',
      '[class*="FirmResult"]',
      '[class*="firm-result"]',
      'main [class*="card"]',
      '.search-results > div > div',
      'a[href*="/firm/"]',
      'a[href*="/firms/"]',
      '[data-testid*="result"]',
      '[role="listitem"]',
    ];

    let resultElements = [];

    for (const selector of resultSelectors) {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) {
        resultElements = [...els];
        break;
      }
    }

    // If no specific selectors matched, try finding links to firm pages
    if (resultElements.length === 0) {
      const allLinks = document.querySelectorAll('a[href]');
      const firmLinks = [...allLinks].filter(a => {
        const href = a.href || '';
        return href.includes('/firm') || href.includes('/practice') || href.includes('/profile');
      });
      if (firmLinks.length > 0) {
        resultElements = firmLinks.map(a => a.closest('div, li, article, section') || a);
      }
    }

    for (const el of resultElements) {
      // Extract link
      const linkEl = el.tagName === 'A' ? el : el.querySelector('a[href]');
      const link = linkEl?.href || '';

      // Extract name — usually the first heading or link text
      const nameEl = el.querySelector('h2, h3, h4, [class*="name"], [class*="title"]');
      const name = (nameEl?.textContent || linkEl?.textContent || '').trim();

      // Extract address
      const addrEl = el.querySelector('[class*="address"], [class*="location"], address');
      const address = (addrEl?.textContent || '').trim();

      // Extract phone
      const phoneEl = el.querySelector('[class*="phone"], [class*="tel"], a[href^="tel:"]');
      const phone = (phoneEl?.textContent || phoneEl?.href?.replace('tel:', '') || '').trim();

      // Extract email
      const emailEl = el.querySelector('a[href^="mailto:"]');
      const email = (emailEl?.href?.replace('mailto:', '') || '').trim();

      // Extract any services/specialisms text
      const svcEl = el.querySelector('[class*="service"], [class*="specialis"], [class*="sector"]');
      const servicesText = (svcEl?.textContent || '').trim();

      if (name && name.length > 2) {
        firms.push({ name, link, address, phone, email, servicesText });
      }
    }

    // Get pagination info
    const nextBtn = document.querySelector(
      'a[rel="next"], button[class*="next"], [class*="pagination"] a:last-child, [aria-label="Next"]'
    );
    const hasNext = nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled');

    // Get result count
    const countMatch = document.body.textContent.match(/(\d+)\s*results?/i);
    const totalResults = countMatch ? parseInt(countMatch[1], 10) : 0;

    // Debug info — page structure
    const debugInfo = {
      title: document.title,
      url: window.location.href,
      mainHTML: document.querySelector('main')?.innerHTML?.substring(0, 500) || '',
      bodyClasses: document.body.className,
      resultElementsFound: resultElements.length,
    };

    return { firms, hasNext, totalResults, debugInfo };
  });
}

// ─── Scrape a firm detail page ────────────────────────────────────
async function scrapeFirmDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await delay(800);

    return page.evaluate(() => {
      const data = {
        name: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        services: [],
        specialisms: [],
        firmNumber: '',
        description: '',
      };

      // Name
      const h1 = document.querySelector('h1');
      data.name = (h1?.textContent || '').trim();

      // Address — look for address block
      const addrEl = document.querySelector(
        '[class*="address"], address, [class*="location"], [class*="contact"] [class*="address"]'
      );
      data.address = (addrEl?.textContent || '').trim().replace(/\s+/g, ' ');

      // Phone
      const phoneEl = document.querySelector('a[href^="tel:"], [class*="phone"], [class*="tel"]');
      if (phoneEl) {
        data.phone = (phoneEl.href?.replace('tel:', '') || phoneEl.textContent || '').trim();
      }

      // Email
      const emailEl = document.querySelector('a[href^="mailto:"]');
      if (emailEl) {
        data.email = emailEl.href.replace('mailto:', '').trim().toLowerCase();
      }

      // Website
      const websiteEl = document.querySelector(
        'a[href*="http"][class*="website"], a[class*="web"], a[rel="noopener"][target="_blank"]'
      );
      if (websiteEl && !websiteEl.href.includes('icaew.com')) {
        data.website = websiteEl.href;
      }
      // Fallback: look for any external link
      if (!data.website) {
        const externalLinks = document.querySelectorAll('a[target="_blank"]');
        for (const link of externalLinks) {
          if (link.href && !link.href.includes('icaew.com') && !link.href.includes('mailto:')) {
            data.website = link.href;
            break;
          }
        }
      }

      // Services / Specialisms — look for list items under service/specialism headers
      const allText = document.body.textContent;
      const sectionEls = document.querySelectorAll(
        '[class*="service"], [class*="specialis"], [class*="sector"], ' +
        '[class*="Service"], [class*="Specialis"], [class*="Sector"]'
      );
      for (const sEl of sectionEls) {
        const items = sEl.querySelectorAll('li, span, [class*="tag"], [class*="chip"]');
        if (items.length > 0) {
          for (const item of items) {
            const text = item.textContent.trim();
            if (text && text.length > 2 && text.length < 100) {
              data.services.push(text);
            }
          }
        } else {
          // Might be a text block with comma-separated values
          const text = sEl.textContent.trim();
          if (text.includes(',')) {
            data.services.push(...text.split(',').map(s => s.trim()).filter(s => s.length > 2));
          }
        }
      }

      // Also try headings approach — find "Services" or "Specialisms" heading, grab sibling content
      const headings = document.querySelectorAll('h2, h3, h4, dt, strong');
      for (const heading of headings) {
        const txt = heading.textContent.toLowerCase().trim();
        if (txt.includes('service') || txt.includes('specialis') || txt.includes('sector')) {
          const sibling = heading.nextElementSibling;
          if (sibling) {
            const listItems = sibling.querySelectorAll('li, span');
            if (listItems.length > 0) {
              for (const li of listItems) {
                const val = li.textContent.trim();
                if (val && val.length > 2 && val.length < 100) {
                  data.services.push(val);
                }
              }
            } else {
              const val = sibling.textContent.trim();
              if (val.includes(',')) {
                data.services.push(...val.split(',').map(s => s.trim()).filter(s => s.length > 2));
              } else if (val.length > 2 && val.length < 200) {
                data.services.push(val);
              }
            }
          }
        }
      }

      // De-duplicate services
      data.services = [...new Set(data.services)];

      // Firm number — look in page text or meta
      const firmNumMatch = allText.match(/firm\s*(?:number|no|#|ref)[:\s]*(\d+)/i);
      if (firmNumMatch) {
        data.firmNumber = firmNumMatch[1];
      }
      // Also try from URL
      const urlMatch = window.location.href.match(/\/firm[s]?\/(\d+)/);
      if (urlMatch) {
        data.firmNumber = urlMatch[1];
      }
      // Try from pathname
      const pathMatch = window.location.pathname.match(/\/(\d+)/);
      if (pathMatch && !data.firmNumber) {
        data.firmNumber = pathMatch[1];
      }

      // Description
      const descEl = document.querySelector(
        '[class*="description"], [class*="about"], [class*="bio"], [class*="profile"]'
      );
      if (descEl) {
        data.description = descEl.textContent.trim().substring(0, 500);
      }

      return data;
    });
  } catch (err) {
    console.error(`    Error scraping detail page ${url}: ${err.message}`);
    return null;
  }
}

// ─── Scrape all firms for a city ──────────────────────────────────
async function scrapeCity(browser, city, stats) {
  console.log(`\n  Scraping: ${city}...`);

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 900 });

  // Intercept API responses for clean JSON data
  const apiData = [];
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('application/json') && (url.includes('search') || url.includes('firm') || url.includes('api'))) {
      try {
        const json = await response.json();
        apiData.push({ url, data: json });
      } catch (e) { /* ignore */ }
    }
  });

  const firms = [];
  let pageNum = 1;
  let hasMore = true;

  while (hasMore) {
    const searchUrl = pageNum === 1
      ? `${SEARCH_BASE}?term=${encodeURIComponent(city)}&filters%5Btype%5D=firm`
      : `${SEARCH_BASE}?term=${encodeURIComponent(city)}&filters%5Btype%5D=firm&page=${pageNum}`;

    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await delay(1500);

      // Check for API data first
      if (apiData.length > 0) {
        const latestApi = apiData[apiData.length - 1];
        // Check if it contains search results
        const apiResults = latestApi.data;
        if (apiResults && (Array.isArray(apiResults) || apiResults.results || apiResults.firms || apiResults.data || apiResults.items)) {
          const items = Array.isArray(apiResults)
            ? apiResults
            : (apiResults.results || apiResults.firms || apiResults.data || apiResults.items || []);

          if (Array.isArray(items) && items.length > 0) {
            console.log(`    Page ${pageNum}: Found ${items.length} firms via API`);
            for (const item of items) {
              firms.push({
                name: item.name || item.firmName || item.practiceName || item.title || '',
                address: item.address || item.fullAddress || '',
                phone: item.phone || item.telephone || item.phoneNumber || '',
                email: item.email || '',
                website: item.website || item.url || '',
                services: item.services || item.specialisms || item.sectors || [],
                firmNumber: String(item.firmNumber || item.id || item.firmId || ''),
                link: item.url || item.profileUrl || item.link || '',
                fromApi: true,
              });
            }

            // Check for more pages from API
            const totalPages = apiResults.totalPages || apiResults.pageCount || 0;
            const total = apiResults.total || apiResults.totalResults || apiResults.count || 0;
            hasMore = totalPages > pageNum || (total > firms.length && items.length > 0);
            pageNum++;
            apiData.length = 0; // Clear for next page
            await delay(DELAY_BETWEEN_PAGES);
            continue;
          }
        }
      }

      // Fallback: DOM scraping
      const result = await scrapeSearchPage(page);

      if (pageNum === 1 && result.firms.length === 0) {
        // Log debug info for first page with no results
        console.log(`    No results found for ${city}`);
        if (result.debugInfo) {
          console.log(`    Page title: ${result.debugInfo.title}`);
          console.log(`    Elements found: ${result.debugInfo.resultElementsFound}`);
        }
        hasMore = false;
        break;
      }

      console.log(`    Page ${pageNum}: Found ${result.firms.length} firms via DOM (total ${result.totalResults || 'unknown'} results)`);

      for (const firm of result.firms) {
        firms.push({ ...firm, fromApi: false });
      }

      hasMore = result.hasNext && result.firms.length > 0;
      pageNum++;

    } catch (err) {
      console.error(`    Error on page ${pageNum} for ${city}: ${err.message}`);
      hasMore = false;
    }

    apiData.length = 0;
    await delay(DELAY_BETWEEN_PAGES);
  }

  // Visit detail pages for firms that have links and need more data
  let detailsVisited = 0;
  for (let i = 0; i < firms.length; i++) {
    const firm = firms[i];
    if (!firm.link || firm.link.includes('javascript:') || firm.fromApi) continue;

    // Only visit details if we're missing key data
    const needsDetail = !firm.email || !firm.website || firm.services.length === 0;
    if (!needsDetail) continue;

    try {
      const detailUrl = firm.link.startsWith('http') ? firm.link : `https://find.icaew.com${firm.link}`;
      const detail = await scrapeFirmDetail(page, detailUrl);
      if (detail) {
        if (!firm.email && detail.email) firm.email = detail.email;
        if (!firm.website && detail.website) firm.website = detail.website;
        if (!firm.phone && detail.phone) firm.phone = detail.phone;
        if (detail.services.length > 0 && firm.services?.length === 0) {
          firm.services = detail.services;
          firm.servicesText = detail.services.join(', ');
        }
        if (!firm.firmNumber && detail.firmNumber) firm.firmNumber = detail.firmNumber;
        if (!firm.address && detail.address) firm.address = detail.address;
        if (detail.description) firm.description = detail.description;
      }
      detailsVisited++;
      await delay(DELAY_BETWEEN_DETAILS);
    } catch (err) {
      console.error(`    Error visiting detail for ${firm.name}: ${err.message}`);
    }
  }

  if (detailsVisited > 0) {
    console.log(`    Visited ${detailsVisited} detail pages for enrichment`);
  }

  await page.close();

  // Update stats
  stats.cityCounts[city] = firms.length;

  console.log(`  ${city}: ${firms.length} firms found`);
  return firms.map(f => ({ ...f, searchCity: city }));
}

// ─── Build Vendor Doc ────────────────────────────────────────────────
function buildVendorDoc(firm) {
  const company = (firm.name || '').trim();
  if (!company || company.length < 3) return null;

  const searchCity = firm.searchCity || '';
  const city = extractCityFromAddress(firm.address, searchCity);
  if (!city) return null;

  const postcode = extractPostcode(firm.address);
  const address = (firm.address || '').replace(/\s+/g, ' ').trim();

  // Parse services
  let rawServices = [];
  if (Array.isArray(firm.services) && firm.services.length > 0) {
    rawServices = firm.services;
  } else if (firm.servicesText) {
    rawServices = firm.servicesText.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }
  const practiceAreas = mapServices(rawServices);

  const phone = (firm.phone || '').replace(/[^\d+\s()-]/g, '').trim();
  const website = (firm.website || '').trim();
  const firmEmail = (firm.email || '').trim().toLowerCase();
  const firmNumber = (firm.firmNumber || '').trim();

  // Generate placeholder email if none found
  const vendorEmail = firmEmail || `icaew-${firmNumber || generateSlug(company, city).substring(0, 30)}@placeholder.tendorai.com`;

  const slug = generateSlug(company, city);

  return {
    name: company,
    company,
    email: vendorEmail,
    vendorType: 'accountant',
    regulatoryBody: 'ICAEW',
    icaewFirmNumber: firmNumber || undefined,
    practiceAreas,
    source: 'icaew-scrape',
    claimed: false,
    services: ['Accountants'],
    location: {
      address,
      city,
      postcode,
      region: '',
      coverage: [city],
    },
    contactInfo: {
      phone,
      website,
    },
    businessProfile: {
      description: firm.description ||
        `${company} is an ICAEW-registered chartered accountant firm based in ${city}.${practiceAreas.length > 0 ? ` Services include ${practiceAreas.join(', ')}.` : ''}`,
      accreditations: ['ICAEW Chartered Accountants'],
    },
    tier: 'free',
    account: {
      status: 'active',
      verificationStatus: 'unverified',
      tier: 'standard',
    },
    listingStatus: 'unclaimed',
    importedAt: new Date(),
    importSource: 'icaew-scrape',
    slug,
    postcodeAreas: postcode ? [postcode.split(' ')[0].toUpperCase()] : [],
  };
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('=== ICAEW Accountant Directory Scraper ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${IMPORT_LIMIT === Infinity ? 'ALL' : IMPORT_LIMIT}`);
  console.log(`City: ${SINGLE_CITY || 'ALL (' + UK_CITIES.length + ' cities)'}`);
  console.log(`Browser: ${HEADED ? 'Headed (visible)' : 'Headless'}`);
  console.log('');

  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not found in .env');
    process.exit(1);
  }

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  // Get existing data for dedup
  const existingEmails = new Set(
    (await Vendor.find().select('email').lean()).map(v => v.email)
  );
  const existingSlugs = new Set(
    (await Vendor.find({ slug: { $exists: true } }).select('slug').lean())
      .map(v => v.slug)
      .filter(Boolean)
  );
  const existingAccountants = await Vendor.countDocuments({ vendorType: 'accountant' });
  console.log(`Existing records: ${existingEmails.size} emails, ${existingSlugs.size} slugs, ${existingAccountants} accountants`);

  // Dedup by company+city — collect existing
  const existingCompanyCityKeys = new Set(
    (await Vendor.find({ vendorType: 'accountant' }).select('company location.city').lean())
      .map(v => `${(v.company || '').toLowerCase()}::${(v.location?.city || '').toLowerCase()}`)
  );
  console.log(`Existing accountant company+city keys: ${existingCompanyCityKeys.size}`);

  // Launch browser
  console.log('\nLaunching browser...');
  const browser = await puppeteer.launch({
    headless: HEADED ? false : 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  console.log('Browser launched.');

  // Scrape cities
  const cities = SINGLE_CITY ? [SINGLE_CITY] : UK_CITIES;
  const allFirms = [];
  const stats = {
    cityCounts: {},
    serviceCounts: {},
    imported: 0,
    skippedDuplicate: 0,
    skippedNoName: 0,
    skippedNoCity: 0,
    skippedDuplicateEmail: 0,
    skippedInsertError: 0,
    errors: [],
  };

  console.log(`\nScraping ${cities.length} cities...`);

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    try {
      const cityFirms = await scrapeCity(browser, city, stats);
      allFirms.push(...cityFirms);

      if (allFirms.length >= IMPORT_LIMIT) {
        console.log(`\n  Reached import limit (${IMPORT_LIMIT}). Stopping scrape.`);
        break;
      }
    } catch (err) {
      console.error(`  FATAL error scraping ${city}: ${err.message}`);
      stats.errors.push(`${city}: ${err.message}`);
    }

    if (i < cities.length - 1) {
      await delay(DELAY_BETWEEN_CITIES);
    }
  }

  await browser.close();
  console.log(`\nBrowser closed. Total raw firms scraped: ${allFirms.length}`);

  // ── Dedup and build vendor docs ──
  console.log('\nDeduplicating and building vendor docs...');
  const toImport = [];
  const seenKeys = new Set();
  const slugsSeen = new Set();

  for (const firm of allFirms) {
    if (toImport.length >= IMPORT_LIMIT) break;

    const doc = buildVendorDoc(firm);
    if (!doc) {
      if (!firm.name || firm.name.length < 3) stats.skippedNoName++;
      else stats.skippedNoCity++;
      continue;
    }

    // Dedup by company+city
    const key = `${doc.company.toLowerCase()}::${doc.location.city.toLowerCase()}`;
    if (seenKeys.has(key) || existingCompanyCityKeys.has(key)) {
      stats.skippedDuplicate++;
      continue;
    }

    // Dedup by email
    if (existingEmails.has(doc.email)) {
      stats.skippedDuplicateEmail++;
      continue;
    }

    // Unique slug
    let slug = doc.slug;
    let slugSuffix = 1;
    while (existingSlugs.has(slug) || slugsSeen.has(slug)) {
      slug = `${doc.slug}-${slugSuffix}`;
      slugSuffix++;
    }
    doc.slug = slug;

    seenKeys.add(key);
    slugsSeen.add(slug);
    existingEmails.add(doc.email);

    // Track service stats
    for (const pa of doc.practiceAreas) {
      stats.serviceCounts[pa] = (stats.serviceCounts[pa] || 0) + 1;
    }

    toImport.push(doc);
  }

  console.log(`Ready to import: ${toImport.length} firms`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN — not inserting into database ---');
    console.log(`Would import ${toImport.length} accountant firms.`);
    if (toImport.length > 0) {
      console.log('\nSample record:');
      console.log(JSON.stringify(toImport[0], null, 2));
      if (toImport.length > 1) {
        console.log('\nSecond sample:');
        console.log(JSON.stringify(toImport[1], null, 2));
      }
    }
  } else {
    // Bulk insert
    console.log('\nInserting into MongoDB...');
    const BATCH_SIZE = 500;

    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE);
      try {
        const result = await Vendor.insertMany(batch, { ordered: false });
        stats.imported += result.length;
      } catch (err) {
        if (err.insertedDocs) {
          stats.imported += err.insertedDocs.length;
        }
        if (err.writeErrors) {
          for (const we of err.writeErrors) {
            stats.skippedInsertError++;
            stats.errors.push(`${batch[we.index]?.company || 'unknown'}: ${we.errmsg?.substring(0, 100)}`);
          }
        } else {
          stats.skippedInsertError += batch.length;
          stats.errors.push(err.message?.substring(0, 200));
        }
      }

      console.log(`  Inserted ${Math.min(i + BATCH_SIZE, toImport.length)}/${toImport.length} — ${stats.imported} successful`);
    }
  }

  // ── Print Results ──
  console.log('\n====================================');
  console.log('       SCRAPE & IMPORT RESULTS');
  console.log('====================================');
  console.log(`Total raw firms scraped:   ${allFirms.length}`);
  console.log(`Ready to import:           ${toImport.length}`);
  console.log(`Imported:                  ${DRY_RUN ? `${toImport.length} (dry run)` : stats.imported}`);
  console.log(`Skipped - duplicate:       ${stats.skippedDuplicate}`);
  console.log(`Skipped - no name:         ${stats.skippedNoName}`);
  console.log(`Skipped - no city:         ${stats.skippedNoCity}`);
  console.log(`Skipped - dup email:       ${stats.skippedDuplicateEmail}`);
  console.log(`Skipped - insert error:    ${stats.skippedInsertError}`);

  if (stats.errors.length > 0) {
    console.log(`\nFirst 20 errors:`);
    stats.errors.slice(0, 20).forEach(e => console.log(`  - ${e}`));
  }

  // City breakdown (top 30)
  const topCities = Object.entries(stats.cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  console.log('\n--- Top 30 Cities ---');
  for (const [city, count] of topCities) {
    console.log(`  ${city}: ${count}`);
  }

  // Service breakdown
  const svcBreakdown = Object.entries(stats.serviceCounts)
    .sort((a, b) => b[1] - a[1]);
  if (svcBreakdown.length > 0) {
    console.log('\n--- Service Categories ---');
    for (const [svc, count] of svcBreakdown) {
      console.log(`  ${svc}: ${count}`);
    }
  }

  // Database totals
  if (!DRY_RUN) {
    const totalVendors = await Vendor.countDocuments();
    const accountants = await Vendor.countDocuments({ vendorType: 'accountant' });
    const solicitors = await Vendor.countDocuments({ vendorType: 'solicitor' });
    const officeEquip = await Vendor.countDocuments({ vendorType: 'office-equipment' });
    const distinctCities = await Vendor.distinct('location.city', { vendorType: 'accountant' });

    console.log('\n--- Database Totals ---');
    console.log(`  Total vendors:          ${totalVendors}`);
    console.log(`  Office equipment:       ${officeEquip}`);
    console.log(`  Solicitors:             ${solicitors}`);
    console.log(`  Accountants:            ${accountants}`);
    console.log(`  Accountant cities:      ${distinctCities.length}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
