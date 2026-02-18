import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = process.env.TENDORAI_API_URL || 'https://ai-procurement-backend-q35u.onrender.com';

async function callApi(path) {
  const url = `${API_URL}/api/v1${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

const server = new McpServer({
  name: 'TendorAI',
  version: '1.0.0',
});

// ─── search_uk_vendors ──────────────────────────────────────────────────────
server.tool(
  'search_uk_vendors',
  'Search for UK business service providers including solicitors, accountants, and office equipment suppliers. Returns structured data including contact details, practice areas, accreditations, and pricing.',
  {
    query: z.string().describe('Company name or search term'),
    city: z.string().optional().describe('City to filter by (e.g. "Cardiff", "London", "Manchester")'),
    vendorType: z.enum(['solicitor', 'accountant', 'office-equipment']).optional().describe('Type of vendor'),
    practiceArea: z.string().optional().describe('Practice area for solicitors (e.g. "conveyancing", "family-law")'),
    limit: z.number().min(1).max(50).optional().describe('Maximum results (default 10)'),
  },
  async ({ query, city, vendorType, practiceArea, limit }) => {
    const params = new URLSearchParams({ q: query });
    if (city) params.set('city', city);
    if (vendorType) params.set('vendorType', vendorType);
    if (practiceArea) params.set('practiceArea', practiceArea);
    if (limit) params.set('limit', String(limit));

    const result = await callApi(`/vendors/search?${params}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ─── get_vendor_profile ─────────────────────────────────────────────────────
server.tool(
  'get_vendor_profile',
  'Get full profile for a specific UK vendor by their slug identifier. Returns detailed company information, contact details, accreditations, and services.',
  {
    slug: z.string().describe('Vendor slug identifier (e.g. "smith-jones-solicitors-cardiff")'),
  },
  async ({ slug }) => {
    const result = await callApi(`/vendors/${encodeURIComponent(slug)}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ─── find_vendors_by_category ───────────────────────────────────────────────
server.tool(
  'find_vendors_by_category',
  'Find UK vendors by service category and optionally by city. Categories include solicitor practice areas (conveyancing, family-law, etc.) and office equipment services (Photocopiers, Telecoms, CCTV, IT).',
  {
    category: z.string().describe('Service category or practice area (e.g. "conveyancing", "Photocopiers", "family-law")'),
    city: z.string().optional().describe('City to filter by'),
    limit: z.number().min(1).max(50).optional().describe('Maximum results (default 20)'),
  },
  async ({ category, city, limit }) => {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (limit) params.set('limit', String(limit));

    const qs = params.toString();
    const result = await callApi(`/vendors/category/${encodeURIComponent(category)}${qs ? '?' + qs : ''}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ─── list_categories ────────────────────────────────────────────────────────
server.tool(
  'list_categories',
  'List all available UK vendor categories with vendor counts. Includes both service categories (Photocopiers, Telecoms, CCTV, IT) and solicitor practice areas (conveyancing, family-law, etc.).',
  {},
  async () => {
    const result = await callApi('/categories');
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ─── Start server ───────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
