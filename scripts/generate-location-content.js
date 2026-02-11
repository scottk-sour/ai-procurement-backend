/**
 * Generate unique location content for GEO pages
 * Usage: node scripts/generate-location-content.js
 *
 * Generates 300-500 words of unique content per category/location combination.
 * Uses Anthropic Claude Haiku 4.5 for cost-effective generation.
 * Stores results in MongoDB LocationContent collection.
 *
 * Rate limited: 1 second between API calls to avoid throttling.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';

// --- Configuration ---
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!MONGODB_URI || !ANTHROPIC_API_KEY) {
  console.error('Missing MONGODB_URI or ANTHROPIC_API_KEY env vars');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// --- LocationContent schema (inline for script independence) ---
const locationContentSchema = new mongoose.Schema({
  category: { type: String, required: true, index: true },
  location: { type: String, required: true, index: true },
  slug: { type: String, required: true },
  content: { type: String, required: true },
  wordCount: { type: Number },
  generatedAt: { type: Date, default: Date.now },
  model: { type: String, default: 'claude-haiku-4-5-20251001' },
}, { timestamps: true });

locationContentSchema.index({ category: 1, location: 1 }, { unique: true });

const LocationContent = mongoose.models.LocationContent ||
  mongoose.model('LocationContent', locationContentSchema);

// --- Data ---
const CATEGORIES = [
  { slug: 'photocopiers', name: 'Photocopiers', value: 'Photocopiers' },
  { slug: 'telecoms', name: 'Telecoms', value: 'Telecoms' },
  { slug: 'cctv', name: 'CCTV', value: 'CCTV' },
  { slug: 'it', name: 'IT Services', value: 'IT' },
  { slug: 'security', name: 'Security Systems', value: 'Security' },
  { slug: 'software', name: 'Business Software', value: 'Software' },
];

const LOCATIONS = [
  'Cardiff', 'Newport', 'Swansea', 'Bridgend', 'Barry', 'Neath', 'Port Talbot',
  'Pontypridd', 'Cwmbran', 'Caerphilly', 'Merthyr Tydfil', 'Llanelli', 'Wrexham',
  'Rhondda', 'Aberdare', 'Bristol', 'Bath', 'Gloucester', 'Cheltenham', 'Exeter',
  'Plymouth', 'Taunton', 'Swindon', 'Weston-super-Mare', 'Torquay', 'Barnstaple',
  'Truro', 'Salisbury', 'Yeovil', 'Poole', 'Bournemouth',
];

const NEARBY_MAP = {
  'Cardiff': ['Newport', 'Bridgend', 'Barry', 'Pontypridd', 'Caerphilly'],
  'Newport': ['Cardiff', 'Bristol', 'Cwmbran', 'Pontypool'],
  'Bristol': ['Bath', 'Newport', 'Gloucester', 'Weston-super-Mare'],
  'Swansea': ['Neath', 'Port Talbot', 'Llanelli', 'Bridgend'],
  'Bath': ['Bristol', 'Trowbridge', 'Frome', 'Chippenham'],
  'Gloucester': ['Cheltenham', 'Bristol', 'Stroud', 'Cirencester'],
  'Exeter': ['Taunton', 'Torquay', 'Plymouth', 'Barnstaple'],
  'Plymouth': ['Exeter', 'Torquay', 'Truro', 'Bodmin'],
};

const REGION_MAP = {
  'Cardiff': 'South Wales', 'Newport': 'South Wales', 'Swansea': 'South Wales',
  'Bridgend': 'South Wales', 'Barry': 'South Wales', 'Neath': 'South Wales',
  'Port Talbot': 'South Wales', 'Pontypridd': 'South Wales', 'Cwmbran': 'South Wales',
  'Caerphilly': 'South Wales', 'Merthyr Tydfil': 'South Wales', 'Llanelli': 'South Wales',
  'Rhondda': 'South Wales', 'Aberdare': 'South Wales', 'Wrexham': 'North Wales',
  'Bristol': 'West of England', 'Bath': 'Somerset', 'Gloucester': 'Gloucestershire',
  'Cheltenham': 'Gloucestershire', 'Exeter': 'Devon', 'Plymouth': 'Devon',
  'Taunton': 'Somerset', 'Swindon': 'Wiltshire', 'Weston-super-Mare': 'Somerset',
  'Torquay': 'Devon', 'Barnstaple': 'Devon', 'Truro': 'Cornwall',
  'Salisbury': 'Wiltshire', 'Yeovil': 'Somerset', 'Poole': 'Dorset',
  'Bournemouth': 'Dorset',
};

// --- Prompt builder ---
function buildPrompt(category, location) {
  const region = REGION_MAP[location] || 'the UK';
  const nearby = NEARBY_MAP[location] || [];
  const nearbyText = nearby.length > 0
    ? `Nearby areas these suppliers also serve include ${nearby.join(', ')}.`
    : '';

  return `Write 300-500 words of unique, helpful content for a UK business directory page about ${category.name.toLowerCase()} suppliers in ${location}, ${region}.

The content should:
- Mention ${location} naturally throughout (at least 3 times)
- Include the region name "${region}" at least once
- ${nearbyText}
- Discuss the local business landscape in ${location} and what ${category.name.toLowerCase()} needs are typical for businesses there
- Provide specific, practical buying advice for ${category.name.toLowerCase()} in this area
- Mention typical business sizes and industries in ${location} that need ${category.name.toLowerCase()}
- Use UK English spelling throughout (e.g. organised, specialised, optimise)
- Do NOT include any headings, markdown, or HTML — just flowing paragraphs
- Do NOT use generic filler text — every sentence should be informative
- Do NOT mention TendorAI by name
- Write in a professional, helpful tone suitable for a B2B audience

The content will appear on a page that already has vendor listings, FAQs, and navigation. This is supplementary buying guide content.`;
}

// --- Main ---
async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  // Check what already exists
  const existing = await LocationContent.find({}, { category: 1, location: 1 }).lean();
  const existingSet = new Set(existing.map(e => `${e.category}:${e.location}`));
  console.log(`Found ${existing.length} existing entries.`);

  const pairs = [];
  for (const cat of CATEGORIES) {
    for (const loc of LOCATIONS) {
      if (!existingSet.has(`${cat.slug}:${loc}`)) {
        pairs.push({ category: cat, location: loc });
      }
    }
  }

  console.log(`${pairs.length} entries to generate.`);

  let generated = 0;
  let failed = 0;

  for (const { category, location } of pairs) {
    try {
      const prompt = buildPrompt(category, location);

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: 'You are a UK business content writer specialising in office equipment procurement. Write factual, helpful content. Use UK English.',
        messages: [
          { role: 'user', content: prompt },
        ],
      });

      const content = response.content[0]?.type === 'text'
        ? response.content[0].text.trim()
        : '';
      if (!content || content.length < 100) {
        console.warn(`Skipping ${category.slug}/${location} — response too short`);
        failed++;
        continue;
      }

      const wordCount = content.split(/\s+/).length;
      const slug = location.toLowerCase().replace(/\s+/g, '-');

      await LocationContent.findOneAndUpdate(
        { category: category.slug, location },
        {
          category: category.slug,
          location,
          slug,
          content,
          wordCount,
          generatedAt: new Date(),
          model: 'claude-haiku-4-5-20251001',
        },
        { upsert: true, new: true }
      );

      generated++;
      console.log(`[${generated}/${pairs.length}] ${category.slug}/${location} — ${wordCount} words`);

      // Rate limit: 1 second between calls
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Failed: ${category.slug}/${location}:`, err.message);
      failed++;
      // Back off on rate limit errors
      if (err.status === 429) {
        console.log('Rate limited, waiting 30 seconds...');
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  console.log(`\nDone. Generated: ${generated}, Failed: ${failed}, Skipped (existing): ${existing.length}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
