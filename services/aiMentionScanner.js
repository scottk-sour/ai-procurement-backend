import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';
import AIMentionScan from '../models/AIMentionScan.js';

const CATEGORY_MAP = {
  Photocopiers: ['photocopier supplier', 'office equipment dealer', 'managed print provider'],
  Telecoms: ['business telecoms provider', 'phone system supplier', 'VoIP provider'],
  CCTV: ['CCTV installer', 'security camera company', 'security system installer'],
  IT: ['IT support company', 'managed IT services provider', 'IT infrastructure company'],
  Security: ['security system installer', 'access control company'],
  Software: ['software provider', 'business software company'],
  'Mortgage Advisors': ['mortgage advisor', 'mortgage broker', 'FCA authorised mortgage advisor'],
  'Estate Agents': ['estate agent', 'letting agent', 'property agent'],
};

function getPrompts(categoryLabel, location) {
  return [
    `Who are the best ${categoryLabel} companies in ${location}?`,
    `I need a ${categoryLabel} supplier in ${location}. Who should I use?`,
    `Can you recommend a good ${categoryLabel} company near ${location}?`,
  ];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a context block describing vendors for the system prompt.
 * Each vendor gets a one-line summary with available profile data.
 */
function buildVendorContext(vendors, productCounts = {}) {
  return vendors.map(v => {
    const parts = [v.company];

    const years = v.businessProfile?.yearsInBusiness;
    if (years) parts.push(`${years} yrs`);

    const specs = v.businessProfile?.specializations?.filter(Boolean);
    if (specs?.length) parts.push(specs.join(', '));

    const certs = v.businessProfile?.certifications?.filter(Boolean);
    if (certs?.length) parts.push(certs.join(', '));

    const reviews = v.performance?.reviewCount;
    const rating = v.performance?.rating;
    if (reviews > 0) parts.push(`${reviews} reviews (${rating?.toFixed(1)} avg)`);

    const products = productCounts[v._id.toString()] || 0;
    if (products > 0) parts.push(`${products} products listed`);

    const coverage = v.location?.coverage?.slice(0, 5)?.join(', ');
    if (coverage) parts.push(`Covers: ${coverage}`);

    const desc = v.businessProfile?.description?.trim();
    if (desc) {
      parts.push(`"${desc.substring(0, 80)}"`);
    }

    return `- ${parts.join(' — ')}`;
  }).join('\n');
}

/**
 * Score a vendor's profile richness for context selection.
 * Higher score = more useful context for the AI.
 */
function profileRichnessScore(vendor, productCounts) {
  let s = 0;
  if (vendor.businessProfile?.description) s += 3;
  if (vendor.performance?.reviewCount > 0) s += 2;
  if (vendor.businessProfile?.certifications?.length) s += 1;
  if (vendor.businessProfile?.yearsInBusiness) s += 1;
  if (productCounts[vendor._id.toString()] > 0) s += 2;
  return s;
}

/**
 * Select up to 20 vendors with the richest profiles for context.
 * All vendors in the group still get scanned for mention matching.
 */
function selectContextVendors(groupVendors, productCounts) {
  return [...groupVendors]
    .sort((a, b) => profileRichnessScore(b, productCounts) - profileRichnessScore(a, productCounts))
    .slice(0, 20);
}

/**
 * Check if a vendor name appears in text (fuzzy match)
 * Returns { found, position } where position is 1-based index in the response
 */
function checkVendorInResponse(vendorCompanyName, responseText) {
  if (!vendorCompanyName || !responseText) return { found: false, position: null };

  const textLower = responseText.toLowerCase();
  const nameLower = vendorCompanyName.toLowerCase().trim();

  // Generate variants
  const variants = [nameLower];
  const suffixes = [' ltd', ' limited', ' plc', ' inc', ' llp', ' uk', ' group', ' services'];
  for (const suffix of suffixes) {
    if (nameLower.endsWith(suffix)) {
      variants.push(nameLower.slice(0, -suffix.length).trim());
    }
  }
  // First two words if name is 3+ words
  const words = nameLower.split(/\s+/);
  if (words.length >= 3) {
    variants.push(words.slice(0, 2).join(' '));
  }

  // Check for match
  const found = variants.some(
    (v) => v.length >= 3 && textLower.includes(v)
  );

  if (!found) return { found: false, position: null };

  // Estimate position by finding where in the text the name appears
  // Split by numbered items or line breaks to estimate ranking position
  const lines = responseText.split(/\n/).filter((l) => l.trim().length > 0);
  let position = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    // Check if this line looks like a company entry (numbered or has a name-like pattern)
    if (/^\d|^\*|^-|company|provider|supplier|installer|ltd|limited/i.test(lines[i].trim())) {
      position++;
    }
    if (variants.some((v) => v.length >= 3 && lineLower.includes(v))) {
      return { found: true, position };
    }
  }

  return { found: true, position: position || 1 };
}

/**
 * Extract company names from an AI response
 */
function extractCompanyNames(responseText) {
  const names = [];
  const lines = responseText.split(/\n/).filter((l) => l.trim().length > 0);

  for (const line of lines) {
    // Match patterns like "1. Company Name" or "**Company Name**" or "- Company Name"
    const patterns = [
      /^\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z\s&'.-]+?)(?:\*\*|\s*[-–:]|\s*$)/,
      /^\*\*([A-Z][A-Za-z\s&'.-]+?)\*\*/,
      /^[-•]\s*\*?\*?([A-Z][A-Za-z\s&'.-]+?)(?:\*\*|\s*[-–:]|\s*$)/,
    ];

    for (const pattern of patterns) {
      const match = line.trim().match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length >= 3 && name.length <= 80) {
          names.push(name);
          break;
        }
      }
    }
  }

  return names;
}

/**
 * Run the AI mention scanner for all vendors
 */
export async function runWeeklyMentionScan() {
  console.log('=== AI Mention Scanner Starting ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Load Anthropic SDK dynamically
  let Anthropic;
  try {
    const mod = await import('@anthropic-ai/sdk');
    Anthropic = mod.default;
  } catch (err) {
    console.error('Failed to load Anthropic SDK:', err.message);
    throw err;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // 2. Pull only PAID vendors (Starter + Pro tier aliases)
  const PAID_TIERS = ['starter', 'basic', 'visible', 'pro', 'managed', 'verified', 'enterprise'];
  const PAID_ACCOUNT_TIERS = ['silver', 'bronze', 'gold', 'platinum'];

  const vendors = await Vendor.find({
    company: { $exists: true, $ne: '' },
    services: { $exists: true, $not: { $size: 0 } },
    $and: [
      { $or: [
        { tier: { $in: PAID_TIERS } },
        { 'account.tier': { $in: PAID_ACCOUNT_TIERS } },
      ] },
      { $or: [
        { 'location.city': { $exists: true, $ne: '' } },
        { 'location.coverage': { $exists: true, $not: { $size: 0 } } },
      ] },
    ],
  }).select('_id company services location tier businessProfile performance').lean();

  console.log(`Found ${vendors.length} paid vendors to scan (free vendors excluded)`);

  // 3. Get product counts per vendor
  const productAgg = await VendorProduct.aggregate([
    { $group: { _id: '$vendorId', count: { $sum: 1 } } }
  ]);
  const productCounts = {};
  for (const p of productAgg) {
    productCounts[p._id.toString()] = p.count;
  }

  // 4. Group vendors by service + primary location (city)
  const groups = new Map(); // key: "category::location" -> vendor[]

  for (const vendor of vendors) {
    const city = vendor.location?.city || '';
    const coverageAreas = vendor.location?.coverage || [];
    const locations = city ? [city] : coverageAreas.slice(0, 2); // Use city or first 2 coverage areas

    for (const service of vendor.services) {
      for (const loc of locations) {
        if (!loc) continue;
        const key = `${service}::${loc}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(vendor);
      }
    }
  }

  console.log(`Grouped into ${groups.size} unique category+location combinations`);

  // 5. Scan each group
  let totalApiCalls = 0;
  let totalMentions = 0;
  let totalVendorsScanned = new Set();
  const scanDate = new Date();
  const mentionDocs = [];

  for (const [key, groupVendors] of groups) {
    const [service, location] = key.split('::');
    const categoryLabels = CATEGORY_MAP[service] || [`${service} company`];
    const primaryLabel = categoryLabels[0];

    console.log(`\nScanning ${service} in ${location}... (${groupVendors.length} vendors)`);

    // Select up to 20 vendors with richest profiles for context
    const contextVendors = selectContextVendors(groupVendors, productCounts);
    const vendorContext = buildVendorContext(contextVendors, productCounts);

    const systemPrompt = `You are a procurement advisor helping UK businesses find local suppliers. Below are verified suppliers registered on TendorAI for ${primaryLabel} services in ${location}. Recommend the top 3-5 most suitable based on their profiles. Use each supplier's exact company name. Format as a numbered list with brief reasoning.

Registered suppliers:
${vendorContext}`;

    const prompts = getPrompts(primaryLabel, location);

    for (const prompt of prompts) {
      try {
        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        totalApiCalls++;
        const responseText = message.content[0]?.text || '';
        const snippet = responseText.substring(0, 500);
        const companiesInResponse = extractCompanyNames(responseText);

        // Check each vendor in this group (not just context vendors)
        let foundCount = 0;
        for (const vendor of groupVendors) {
          totalVendorsScanned.add(vendor._id.toString());
          const { found, position } = checkVendorInResponse(vendor.company, responseText);

          let positionLabel = 'not_mentioned';
          if (found) {
            foundCount++;
            totalMentions++;
            if (position === 1) positionLabel = 'first';
            else if (position <= 3) positionLabel = 'top3';
            else positionLabel = 'mentioned';
          }

          mentionDocs.push({
            vendorId: vendor._id,
            scanDate,
            prompt,
            mentioned: found,
            position: positionLabel,
            aiModel: 'claude-haiku',
            competitorsMentioned: found
              ? companiesInResponse.filter(
                  (n) => n.toLowerCase() !== vendor.company?.toLowerCase()
                )
              : companiesInResponse,
            category: service,
            location,
            responseSnippet: snippet,
          });
        }

        console.log(`  "${prompt.substring(0, 50)}..." → ${foundCount}/${groupVendors.length} vendors found`);

        // Rate limit: 2-second delay between API calls
        await sleep(2000);
      } catch (apiErr) {
        console.error(`  API error for "${prompt.substring(0, 40)}...":`, apiErr.message);
        // Still save "not mentioned" for all vendors in this group
        for (const vendor of groupVendors) {
          totalVendorsScanned.add(vendor._id.toString());
          mentionDocs.push({
            vendorId: vendor._id,
            scanDate,
            prompt,
            mentioned: false,
            position: 'not_mentioned',
            aiModel: 'claude-haiku',
            competitorsMentioned: [],
            category: service,
            location,
            responseSnippet: `API error: ${apiErr.message}`,
          });
        }
        await sleep(2000);
      }
    }
  }

  // 6. Bulk insert all mention documents
  if (mentionDocs.length > 0) {
    await AIMentionScan.insertMany(mentionDocs, { ordered: false });
    console.log(`\nSaved ${mentionDocs.length} mention records`);
  }

  // 7. Summary
  const vendorsWithMentions = new Set(
    mentionDocs.filter((d) => d.mentioned).map((d) => d.vendorId.toString())
  );

  console.log('\n=== Scan Complete ===');
  console.log(`API calls made: ${totalApiCalls}`);
  console.log(`Vendors scanned: ${totalVendorsScanned.size}`);
  console.log(`Vendors mentioned at least once: ${vendorsWithMentions.size}`);
  console.log(`Total mention instances: ${totalMentions}`);
  console.log(`Total records saved: ${mentionDocs.length}`);

  return {
    apiCalls: totalApiCalls,
    vendorsScanned: totalVendorsScanned.size,
    vendorsMentioned: vendorsWithMentions.size,
    totalMentions,
    recordsSaved: mentionDocs.length,
  };
}
