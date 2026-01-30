/**
 * Vendor Import Script for TendorAI
 * Imports vendors from Excel spreadsheet (TendorAI-All-Vendors-Combined.xlsx)
 *
 * Usage:
 *   node scripts/importVendors.js ./TendorAI-All-Vendors-Combined.xlsx --dry-run
 *   node scripts/importVendors.js ./TendorAI-All-Vendors-Combined.xlsx --limit=10
 *   node scripts/importVendors.js ./TendorAI-All-Vendors-Combined.xlsx
 */

import mongoose from 'mongoose';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import Vendor from '../models/Vendor.js';

// Valid services enum
const VALID_SERVICES = ['CCTV', 'Photocopiers', 'IT', 'Telecoms', 'Security', 'Software'];

// Service name normalization
const SERVICE_MAP = {
  'photocopiers': 'Photocopiers',
  'photocopier': 'Photocopiers',
  'printers': 'Photocopiers',
  'mfp': 'Photocopiers',
  'copiers': 'Photocopiers',
  'telecoms': 'Telecoms',
  'telecom': 'Telecoms',
  'telecommunications': 'Telecoms',
  'phone systems': 'Telecoms',
  'voip': 'Telecoms',
  'phones': 'Telecoms',
  'cctv': 'CCTV',
  'security': 'Security',
  'security systems': 'Security',
  'cameras': 'CCTV',
  'surveillance': 'CCTV',
  'it': 'IT',
  'it services': 'IT',
  'it solutions': 'IT',
  'managed it': 'IT',
  'technology': 'IT',
  'computers': 'IT',
  'networking': 'IT',
  'software': 'Software'
};

/**
 * Extract postcode area from full postcode
 * "NP4 0HZ" → ["NP4"], "CF10 1AA" → ["CF10"], "BS1 4DJ" → ["BS1"]
 */
function extractPostcodeAreas(postcode) {
  if (!postcode) return [];
  const clean = postcode.toString().toUpperCase().trim();

  // Match outward code: 1-2 letters + 1-2 digits (e.g., NP4, CF10, BS1, SW1A)
  const match = clean.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  if (match) return [match[1]];

  // Fallback: just the letter prefix
  const letters = clean.match(/^([A-Z]{1,2})/);
  return letters ? [letters[1]] : [];
}

/**
 * Parse comma-separated string into array
 */
function parseArray(str) {
  if (!str) return [];
  return str.toString()
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Normalize service names to valid enum values
 */
function normalizeServices(servicesStr) {
  if (!servicesStr) return ['Photocopiers']; // Default

  const services = parseArray(servicesStr);
  const normalized = new Set();

  for (const service of services) {
    const lower = service.toLowerCase();
    const mapped = SERVICE_MAP[lower];
    if (mapped && VALID_SERVICES.includes(mapped)) {
      normalized.add(mapped);
    } else if (VALID_SERVICES.includes(service)) {
      normalized.add(service);
    }
  }

  return normalized.size > 0 ? Array.from(normalized) : ['Photocopiers'];
}

/**
 * Parse number safely
 */
function parseNumber(val) {
  if (!val) return 0;
  const num = parseInt(val.toString().replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse years in business - handles founding years and large numbers
 */
function parseYearsInBusiness(val) {
  if (!val) return null;
  const str = val.toString().trim();
  let num = parseInt(str.replace(/[^0-9]/g, ''), 10);

  if (isNaN(num)) return null;

  // If it looks like a founding year (1900-2025), calculate years (cap at 100)
  if (num > 1900 && num < 2030) {
    const years = 2026 - num;
    return Math.min(years, 100); // Cap at schema max
  }

  // If it's a very large number, try extracting first 4 digits as year
  if (num > 100000) {
    const yearStr = str.substring(0, 4);
    const year = parseInt(yearStr, 10);
    if (year > 1900 && year < 2030) {
      const years = 2026 - year;
      return Math.min(years, 100); // Cap at schema max
    }
    return null;
  }

  // If it's a reasonable number of years (0-100), use it directly
  if (num >= 0 && num <= 100) {
    return num;
  }

  return null;
}

/**
 * Map response time to valid enum value
 * Schema enum: ['4hr', '8hr', 'Next day', '48hr', '3-5 days']
 */
function mapResponseTime(val) {
  if (!val) return null;
  const lower = val.toString().toLowerCase().trim();

  // Same day / 4 hours variations → '4hr'
  if (lower.includes('same day') || lower.includes('same-day') ||
      lower.includes('4 hour') || lower.includes('4-hour') || lower.includes('4hr') ||
      lower.includes('minutes')) {
    return '4hr';
  }

  // 8 hours variations → '8hr'
  if (lower.includes('8 hour') || lower.includes('8-hour') || lower.includes('8hr')) {
    return '8hr';
  }

  // Next day variations → 'Next day'
  if (lower.includes('next day') || lower.includes('next-day') || lower.includes('nextday') ||
      lower.includes('next business day') || lower.includes('1 day')) {
    return 'Next day';
  }

  // 48 hours / 2 days → '48hr'
  if (lower.includes('48') || lower.includes('2 day')) {
    return '48hr';
  }

  // 3-5 days
  if (lower.includes('3-5') || lower.includes('3 to 5') || lower.includes('week')) {
    return '3-5 days';
  }

  return null;
}

/**
 * Map support hours to valid enum value
 * Schema enum: ['9-5', '8-6', '24/7', 'Extended hours']
 */
function mapSupportHours(val) {
  if (!val) return null;
  const lower = val.toString().toLowerCase().trim();

  // 24/7 variations
  if (lower.includes('24/7') || lower.includes('24-7') || lower.includes('24 7') ||
      lower.includes('around the clock') || lower.includes('all hours')) {
    return '24/7';
  }

  // Extended hours
  if (lower.includes('extended') || lower.includes('8-8') || lower.includes('7am-7pm') ||
      lower.includes('7-7') || lower.includes('6am') || lower.includes('10pm')) {
    return 'Extended hours';
  }

  // 8-6 hours
  if (lower.includes('8-6') || lower.includes('8:00-18') || lower.includes('8am-6pm')) {
    return '8-6';
  }

  // Standard business hours (9-5 or similar) - most common, check last
  if (lower.includes('9-5') || lower.includes('9:00') || lower.includes('9am') ||
      lower.includes('8:30') || lower.includes('8-5') || lower.includes('8am') ||
      lower.includes('business hours') || lower.includes('office hours') ||
      lower.includes('mon-fri') || lower.includes('weekday')) {
    return '9-5';
  }

  return null;
}

/**
 * Clean phone number - lenient, returns empty string if invalid
 */
function cleanPhone(phone) {
  if (!phone) return '';
  // Remove all non-digit characters except +
  let cleaned = phone.toString().replace(/[^0-9+]/g, '');

  // Handle UK numbers
  if (cleaned.length === 10 && !cleaned.startsWith('+')) {
    cleaned = '+44' + cleaned;
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = '+44' + cleaned.substring(1);
  }

  // Validate: must be 10-15 digits (with optional +)
  const digitsOnly = cleaned.replace(/\+/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return ''; // Invalid, return empty instead of failing
  }

  return cleaned;
}

/**
 * Clean website URL
 */
function cleanWebsite(url) {
  if (!url) return '';
  let cleaned = url.toString().trim();
  if (cleaned && !cleaned.startsWith('http')) {
    cleaned = 'https://' + cleaned;
  }
  return cleaned;
}

/**
 * Generate random password for unclaimed vendors
 */
function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Map company size to enum value
 */
function mapCompanySize(size) {
  if (!size) return 'Small (1-50)';
  const lower = size.toString().toLowerCase();
  if (lower.includes('startup')) return 'Startup';
  if (lower.includes('small')) return 'Small (1-50)';
  if (lower.includes('medium')) return 'Medium (51-200)';
  if (lower.includes('large')) return 'Large (201-1000)';
  if (lower.includes('enterprise')) return 'Enterprise (1000+)';
  return 'Small (1-50)';
}

/**
 * Main import function
 */
async function importVendors(filePath, options = {}) {
  const { dryRun = false, limit = null } = options;

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     TENDORAI VENDOR IMPORT SCRIPT      ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE IMPORT'}`);
  console.log(`Limit: ${limit || 'All rows'}\n`);

  // Connect to MongoDB (skip in dry-run mode)
  if (!dryRun) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB\n');
  } else {
    console.log('⏭️  Skipping MongoDB connection (dry-run mode)\n');
  }

  // Read Excel file
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(filePath);

  // Find the right sheet
  const sheetNames = ['Vendors', 'vendors', 'Sheet1', 'Data', 'All Vendors'];
  let sheet = null;
  let usedSheet = '';

  for (const name of sheetNames) {
    if (workbook.Sheets[name]) {
      sheet = workbook.Sheets[name];
      usedSheet = name;
      break;
    }
  }

  if (!sheet) {
    sheet = workbook.Sheets[workbook.SheetNames[0]];
    usedSheet = workbook.SheetNames[0];
  }

  console.log(`✓ Using sheet: "${usedSheet}"`);

  // Convert to array of arrays
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Spreadsheet structure:
  // Row 0: Tier labels (FREE TIER / PAID TIER)
  // Row 1: Column headers
  // Row 2+: Data

  // Skip first 2 rows (tier labels and headers)
  const dataRows = rawData.slice(2);
  console.log(`✓ Found ${dataRows.length} data rows\n`);

  if (dataRows.length === 0) {
    console.log('No data found in spreadsheet');
    await mongoose.disconnect();
    return { total: 0, imported: 0, skipped: 0, errors: [] };
  }

  // Column mapping (0-indexed based on spreadsheet)
  // FREE TIER: 0-11
  // PAID TIER: 12-21
  const COL = {
    COMPANY_NAME: 0,
    EMAIL: 1,
    PHONE: 2,
    WEBSITE: 3,
    ADDRESS: 4,
    CITY: 5,
    POSTCODE: 6,
    REGION: 7,
    COVERAGE: 8,
    SERVICES: 9,
    BRANDS: 10,
    YEARS_IN_BUSINESS: 11,
    COMPANY_SIZE: 12,
    NUM_EMPLOYEES: 13,
    CERTIFICATIONS: 14,
    ACCREDITATIONS: 15,
    SPECIALIZATIONS: 16,
    RESPONSE_TIME: 17,
    SUPPORT_HOURS: 18,
    PAYMENT_TERMS: 19,
    MIN_CONTRACT_VALUE: 20,
    DESCRIPTION: 21
  };

  const results = {
    total: 0,
    imported: 0,
    skipped: 0,
    errors: []
  };

  const rowsToProcess = limit ? dataRows.slice(0, limit) : dataRows;

  for (let i = 0; i < rowsToProcess.length; i++) {
    const row = rowsToProcess[i];
    results.total++;

    const companyName = (row[COL.COMPANY_NAME] || '').toString().trim();
    const email = (row[COL.EMAIL] || '').toString().trim().toLowerCase();

    // Skip empty rows
    if (!companyName) {
      console.log(`[${i + 1}] SKIP: Empty company name`);
      results.skipped++;
      continue;
    }

    // Check for existing vendor (skip in dry-run mode)
    if (!dryRun) {
      const existing = await Vendor.findOne({
        $or: [
          { company: companyName },
          ...(email ? [{ email: email }] : [])
        ]
      });

      if (existing) {
        console.log(`[${i + 1}] SKIP: "${companyName}" already exists`);
        results.skipped++;
        continue;
      }
    }

    // Generate temporary password
    const tempPassword = generatePassword();

    // Build vendor document
    const vendorData = {
      // Core fields
      name: companyName,
      company: companyName,
      email: email || `unclaimed-${Date.now()}-${i}@tendorai.com`,
      password: tempPassword,

      // Services
      services: normalizeServices(row[COL.SERVICES]),

      // Brands
      brands: parseArray(row[COL.BRANDS]),

      // Location
      location: {
        address: (row[COL.ADDRESS] || '').toString().trim(),
        city: (row[COL.CITY] || '').toString().trim(),
        postcode: (row[COL.POSTCODE] || '').toString().trim().toUpperCase(),
        region: (row[COL.REGION] || '').toString().trim(),
        coverage: parseArray(row[COL.COVERAGE])
      },

      // Postcode areas for matching
      postcodeAreas: extractPostcodeAreas(row[COL.POSTCODE]),

      // Contact info
      contactInfo: {
        phone: cleanPhone(row[COL.PHONE]),
        website: cleanWebsite(row[COL.WEBSITE])
      },

      // Business profile
      businessProfile: {
        yearsInBusiness: parseYearsInBusiness(row[COL.YEARS_IN_BUSINESS]),
        companySize: mapCompanySize(row[COL.COMPANY_SIZE]),
        numEmployees: parseNumber(row[COL.NUM_EMPLOYEES]),
        certifications: parseArray(row[COL.CERTIFICATIONS]),
        accreditations: parseArray(row[COL.ACCREDITATIONS]),
        specializations: parseArray(row[COL.SPECIALIZATIONS]),
        description: (row[COL.DESCRIPTION] || '').toString().trim()
      },

      // Service capabilities
      serviceCapabilities: {
        responseTime: mapResponseTime(row[COL.RESPONSE_TIME]),
        supportHours: mapSupportHours(row[COL.SUPPORT_HOURS])
      },

      // Commercial
      commercial: {
        paymentTerms: row[COL.PAYMENT_TERMS] || 'Net 30',
        minimumOrderValue: parseNumber(row[COL.MIN_CONTRACT_VALUE])
      },

      // Account settings for imported vendors
      account: {
        status: 'pending',
        verificationStatus: 'unverified',
        tier: 'standard'
      },

      // Subscription
      tier: 'free',
      subscriptionStatus: 'none',

      // Import tracking
      listingStatus: 'unclaimed',
      importedAt: new Date(),
      importSource: path.basename(filePath)
    };

    if (dryRun) {
      const services = vendorData.services.join(', ');
      const city = vendorData.location.city || 'No city';
      const postcodes = vendorData.postcodeAreas.join(', ') || 'No postcode';
      console.log(`[${i + 1}] DRY RUN: "${companyName}" | ${city} | ${postcodes} | ${services}`);
      results.imported++;
    } else {
      try {
        // Hash password
        const salt = await bcrypt.genSalt(12);
        vendorData.password = await bcrypt.hash(tempPassword, salt);

        const vendor = new Vendor(vendorData);
        await vendor.save();
        console.log(`[${i + 1}] ✓ IMPORTED: "${companyName}" (${vendorData.location.city})`);
        results.imported++;
      } catch (error) {
        console.error(`[${i + 1}] ✗ ERROR: "${companyName}" - ${error.message}`);
        results.errors.push({
          row: i + 1,
          company: companyName,
          error: error.message
        });
      }
    }
  }

  // Summary
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║           IMPORT COMPLETE              ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`Total rows processed: ${results.total}`);
  console.log(`Successfully imported: ${results.imported}`);
  console.log(`Skipped (existing/empty): ${results.skipped}`);
  console.log(`Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.slice(0, 10).forEach(e => {
      console.log(`  Row ${e.row}: ${e.company} - ${e.error}`);
    });
    if (results.errors.length > 10) {
      console.log(`  ... and ${results.errors.length - 10} more`);
    }
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes were made to the database');
    console.log('   Run without --dry-run to actually import vendors');
  } else {
    await mongoose.disconnect();
  }

  console.log('\n');
  return results;
}

// CLI handling
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

if (!filePath) {
  console.log('Usage: node scripts/importVendors.js <file.xlsx> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run     Preview import without saving');
  console.log('  --limit=N     Only process first N rows');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/importVendors.js ./TendorAI-All-Vendors-Combined.xlsx --dry-run');
  console.log('  node scripts/importVendors.js ./TendorAI-All-Vendors-Combined.xlsx --limit=10');
  console.log('');
  console.log('Expected spreadsheet columns (22 total):');
  console.log('  FREE TIER: company_name, email, phone, website, address, city,');
  console.log('             postcode, region, coverage, services, brands, years_in_business');
  console.log('  PAID TIER: company_size, num_employees, certifications, accreditations,');
  console.log('             specializations, response_time, support_hours, payment_terms,');
  console.log('             min_contract_value, description');
  process.exit(1);
}

importVendors(filePath, { dryRun, limit })
  .then(results => {
    process.exit(results.errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('\n✗ Import failed:', err.message);
    process.exit(1);
  });

export default importVendors;
