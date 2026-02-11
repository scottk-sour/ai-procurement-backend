/**
 * TendorAI MCP Server for Claude
 *
 * Minimal Model Context Protocol server wrapping the TendorAI API.
 * Provides three tools for finding UK office equipment suppliers.
 *
 * Deploy: node mcp-server.js (runs on port 3100)
 *
 * Tools:
 *   - search_suppliers: Search by category, location, requirements
 *   - get_vendor_profile: Get full vendor details by ID
 *   - get_quote: Get matched vendors with pricing for specific needs
 */

import express from 'express';

const app = express();
app.use(express.json());

const BACKEND_URL = process.env.BACKEND_URL ||
  'https://ai-procurement-backend-q35u.onrender.com';
const PORT = process.env.MCP_PORT || 3100;

// --- MCP Tool Definitions ---
const TOOLS = [
  {
    name: 'search_suppliers',
    description: 'Search for verified UK office equipment suppliers by category and location. Returns company names, ratings, coverage areas, and profile URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Service category',
          enum: ['Photocopiers', 'Telecoms', 'CCTV', 'IT', 'Security', 'Software'],
        },
        location: {
          type: 'string',
          description: 'UK city name or region (e.g. Cardiff, Bristol, South Wales)',
        },
        requirements: {
          type: 'string',
          description: 'Optional free-text requirements (e.g. "colour A3 copier for 10k pages")',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'get_vendor_profile',
    description: 'Get full details for a specific vendor by their ID. Returns company info, services, products, ratings, and coverage.',
    inputSchema: {
      type: 'object',
      properties: {
        vendorId: {
          type: 'string',
          description: 'The vendor ID from a previous search result',
        },
      },
      required: ['vendorId'],
    },
  },
  {
    name: 'get_quote',
    description: 'Get AI-matched vendors with pricing for specific office equipment needs. Best for detailed requirements with volume and budget.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['Photocopiers', 'Telecoms', 'CCTV', 'IT', 'Security', 'Software'],
        },
        location: {
          type: 'string',
          description: 'UK postcode or city name',
        },
        volume: {
          type: 'number',
          description: 'Monthly print volume (for photocopiers) or number of users',
        },
        features: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required features (e.g. colour, a3, scanning, voip)',
        },
      },
      required: ['category', 'location'],
    },
  },
];

// --- Tool handlers ---
async function handleSearchSuppliers(args) {
  const params = new URLSearchParams();
  if (args.category) params.set('category', args.category);
  if (args.location) params.set('location', args.location);
  params.set('limit', '10');

  const res = await fetch(`${BACKEND_URL}/api/public/vendors?${params}`);
  const data = await res.json();

  if (!data.success && !data.data) {
    return { content: [{ type: 'text', text: 'No suppliers found for this search.' }] };
  }

  const vendors = (data.data || []).slice(0, 10);
  const lines = vendors.map((v, i) => {
    const rating = v.performance?.rating ? ` (${v.performance.rating.toFixed(1)}★)` : '';
    const city = v.location?.city || 'UK';
    const coverage = v.location?.coverage?.slice(0, 3).join(', ') || '';
    return `${i + 1}. **${v.company}**${rating} — ${city}${coverage ? ` | Covers: ${coverage}` : ''}\n   Profile: https://tendorai.com/suppliers/profile/${v._id || v.id}`;
  });

  const text = vendors.length > 0
    ? `Found ${vendors.length} ${args.category || ''} suppliers${args.location ? ` in ${args.location}` : ''}:\n\n${lines.join('\n\n')}`
    : `No suppliers found for ${args.category || 'this category'}${args.location ? ` in ${args.location}` : ''}.`;

  return { content: [{ type: 'text', text }] };
}

async function handleGetVendorProfile(args) {
  const res = await fetch(`${BACKEND_URL}/api/public/vendors?limit=100`);
  const data = await res.json();
  const vendor = (data.data || []).find(v => (v._id || v.id) === args.vendorId);

  if (!vendor) {
    return { content: [{ type: 'text', text: `Vendor ${args.vendorId} not found.` }] };
  }

  const text = [
    `# ${vendor.company}`,
    vendor.businessProfile?.description || '',
    '',
    `**Services:** ${(vendor.services || []).join(', ')}`,
    `**Location:** ${vendor.location?.city || 'UK'}${vendor.location?.region ? `, ${vendor.location.region}` : ''}`,
    `**Coverage:** ${(vendor.location?.coverage || []).join(', ')}`,
    vendor.performance?.rating ? `**Rating:** ${vendor.performance.rating.toFixed(1)}/5 (${vendor.performance.reviewCount || 0} reviews)` : '',
    vendor.businessProfile?.yearsInBusiness ? `**Years in Business:** ${vendor.businessProfile.yearsInBusiness}+` : '',
    vendor.brands?.length ? `**Brands:** ${vendor.brands.join(', ')}` : '',
    `**Tier:** ${vendor.tier || 'free'}`,
    '',
    `Profile: https://tendorai.com/suppliers/profile/${args.vendorId}`,
  ].filter(Boolean).join('\n');

  return { content: [{ type: 'text', text }] };
}

async function handleGetQuote(args) {
  const query = [
    args.category,
    args.location ? `in ${args.location}` : '',
    args.volume ? `${args.volume} pages per month` : '',
    args.features?.length ? `needs: ${args.features.join(', ')}` : '',
  ].filter(Boolean).join(' ');

  const res = await fetch(`${BACKEND_URL}/api/ai-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      category: args.category,
      location: args.location,
      volume: args.volume,
      requirements: {
        features: args.features || [],
      },
    }),
  });

  const data = await res.json();

  if (!data.success || !data.data?.vendors?.length) {
    return { content: [{ type: 'text', text: `No matching vendors found. Try broadening your search criteria.` }] };
  }

  const vendors = data.data.vendors.slice(0, 5);
  const lines = vendors.map((v, i) => {
    const products = (v.products || []).slice(0, 2).map(p =>
      `  - ${p.name}: ${p.pricing?.estimatedMonthly ? `~£${p.pricing.estimatedMonthly}/mo` : 'Price on request'}`
    ).join('\n');
    return `${i + 1}. **${v.company}** (Match: ${v.matchScore}%)${products ? `\n${products}` : ''}`;
  });

  const text = `AI-matched vendors for ${args.category}${args.location ? ` in ${args.location}` : ''}:\n\n${lines.join('\n\n')}`;

  return { content: [{ type: 'text', text }] };
}

// --- MCP Endpoints ---

// List tools
app.get('/mcp/tools', (req, res) => {
  res.json({ tools: TOOLS });
});

// Execute tool
app.post('/mcp/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body.arguments || req.body;

  try {
    let result;
    switch (toolName) {
      case 'search_suppliers':
        result = await handleSearchSuppliers(args);
        break;
      case 'get_vendor_profile':
        result = await handleGetVendorProfile(args);
        break;
      case 'get_quote':
        result = await handleGetQuote(args);
        break;
      default:
        return res.status(404).json({ error: `Unknown tool: ${toolName}` });
    }
    res.json(result);
  } catch (err) {
    console.error(`Tool ${toolName} error:`, err);
    res.status(500).json({
      content: [{ type: 'text', text: `Error executing ${toolName}: ${err.message}` }],
    });
  }
});

// Health check
app.get('/mcp/health', (req, res) => {
  res.json({ status: 'ok', tools: TOOLS.length });
});

app.listen(PORT, () => {
  console.log(`TendorAI MCP Server running on port ${PORT}`);
  console.log(`Tools available: ${TOOLS.map(t => t.name).join(', ')}`);
});
