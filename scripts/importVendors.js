/**
 * Vendor Import Script
 * Imports vendors from Excel spreadsheet as "unclaimed" listings
 *
 * Usage:
 *   node scripts/importVendors.js ./path/to/vendors.xlsx
 *   node scripts/importVendors.js ./path/to/vendors.xlsx --dry-run
 *   node scripts/importVendors.js ./path/to/vendors.xlsx --limit=50
 */

import mongoose from 'mongoose';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import Vendor model - adjust path as needed
import Vendor from '../models/Vendor.js';

// Service category mapping - normalize various inputs to our standard categories
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
  'cctv': 'CCTV',
  'security': 'CCTV',
  'security systems': 'CCTV',
  'cameras': 'CCTV',
  'surveillance': 'CCTV',
  'it': 'IT',
  'it services': 'IT',
  'it solutions': 'IT',
  'managed it': 'IT',
  'technology': 'IT',
  'computers': 'IT',
  'networking': 'IT'
};

const VALID_SERVICES = ['Photocopiers', 'Telecoms', 'CCTV', 'IT'];

/**
 * Normalize service names to our standard categories
 */
function normalizeServices(servicesStr) {
  if (!servicesStr) return ['Photocopiers']; // Default service

  const services = servicesStr.toString().split(/[,;|]/).map(s => s.trim().toLowerCase());
  const normalized = new Set();

  for (const service of services) {
    const mapped = SERVICE_MAP[service];
    if (mapped && VALID_SERVICES.includes(mapped)) {
      normalized.add(mapped);
    }
  }

  // Return at least one service
  return normalized.size > 0 ? Array.from(normalized) : ['Photocopiers'];
}

/**
 * Parse coverage areas from various formats
 */
function parseCoverageAreas(coverageStr) {
  if (!coverageStr) return [];
  return coverageStr.toString()
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Generate a random temporary password for unclaimed vendors
 */
function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Main import function
 */
async function importVendors(filePath, options = {}) {
  const { dryRun = false, limit = null, skipExisting = true } = options;

  console.log('\n========================================');
  console.log('     TENDORAI VENDOR IMPORT SCRIPT');
  console.log('========================================\n');
  console.log(`File: ${filePath}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Limit: ${limit || 'No limit'}`);
  console.log(`Skip existing: ${skipExisting}`);
  console.log('');

  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable not set');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');

  // Read Excel file
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(filePath);

  // Try common sheet names
  const sheetNames = ['Vendors', 'vendors', 'Sheet1', 'Data', workbook.SheetNames[0]];
  let sheet = null;
  let usedSheetName = '';

  for (const name of sheetNames) {
    if (workbook.Sheets[name]) {
      sheet = workbook.Sheets[name];
      usedSheetName = name;
      break;
    }
  }

  if (!sheet) {
    throw new Error(`Could not find a valid sheet. Available: ${workbook.SheetNames.join(', ')}`);
  }

  console.log(`Using sheet: "${usedSheetName}"`);

  // Convert to JSON with headers from first row
  const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`Found ${rawData.length} rows in spreadsheet\n`);

  if (rawData.length === 0) {
    console.log('No data found in spreadsheet');
    await mongoose.disconnect();
    return { total: 0, imported: 0, skipped: 0, errors: [] };
  }

  // Show sample of first row to help with mapping
  console.log('Sample row columns:', Object.keys(rawData[0]).slice(0, 10).join(', '));
  console.log('');

  const results = {
    total: 0,
    imported: 0,
    skipped: 0,
    updated: 0,
    errors: []
  };

  const rowsToProcess = limit ? rawData.slice(0, limit) : rawData;

  for (const row of rowsToProcess) {
    results.total++;

    // Try to extract company name from various possible column names
    const companyName = row.company_name || row.companyName || row.Company ||
                       row['Company Name'] || row.name || row.Name || '';
    const email = row.email || row.Email || row['Email Address'] || '';

    // Skip empty rows
    if (!companyName || companyName.trim() === '') {
      console.log(`[${results.total}] SKIP: Empty company name`);
      results.skipped++;
      continue;
    }

    // Check if vendor already exists
    const existing = await Vendor.findOne({
      $or: [
        { company: companyName.trim() },
        { email: email.trim().toLowerCase() }
      ].filter(q => Object.values(q)[0]) // Remove empty queries
    });

    if (existing && skipExisting) {
      console.log(`[${results.total}] SKIP: "${companyName}" (already exists)`);
      results.skipped++;
      continue;
    }

    // Extract phone and clean it
    let phone = row.phone || row.Phone || row['Phone Number'] || row.telephone || '';
    phone = phone.toString().replace(/[^0-9+]/g, '');
    if (phone && !phone.startsWith('+') && phone.length === 10) {
      phone = '+44' + phone.substring(1);
    } else if (phone && !phone.startsWith('+') && phone.length === 11) {
      phone = '+44' + phone.substring(1);
    }

    // Build vendor object
    const tempPassword = generateTempPassword();
    const vendorData = {
      name: companyName.trim(),
      company: companyName.trim(),
      email: email.trim().toLowerCase() || `unclaimed-${Date.now()}-${results.total}@tendorai.com`,
      password: tempPassword,

      services: normalizeServices(row.services || row.Services || row.category || row.Category),

      location: {
        address: row.address || row.Address || row['Street Address'] || '',
        city: row.city || row.City || row.town || row.Town || '',
        postcode: (row.postcode || row.Postcode || row['Post Code'] || row.zip || '').toString().toUpperCase(),
        region: row.region || row.Region || row.county || row.County || '',
        coverage: parseCoverageAreas(row.coverage || row.Coverage || row['Coverage Areas'] || row.areas)
      },

      contactInfo: {
        phone: phone,
        website: row.website || row.Website || row.url || row.URL || ''
      },

      businessProfile: {
        yearsInBusiness: parseInt(row.years_in_business || row.yearsInBusiness || row['Years In Business'] || 0) || 0,
        companySize: row.company_size || row.companySize || row['Company Size'] || 'Small (1-50)',
        certifications: parseCoverageAreas(row.certifications || row.Certifications || ''),
        accreditations: parseCoverageAreas(row.accreditations || row.Accreditations || row.brands || row.Brands || ''),
        specializations: parseCoverageAreas(row.specializations || row.Specializations || '')
      },

      account: {
        status: 'pending',
        verificationStatus: 'unverified',
        tier: 'standard'
      },

      tier: 'free',
      subscriptionStatus: 'none',

      // Import tracking fields
      listingStatus: 'unclaimed',
      importedAt: new Date(),
      importSource: path.basename(filePath)
    };

    if (dryRun) {
      console.log(`[${results.total}] DRY RUN: Would import "${companyName}" (${vendorData.location.city || 'No city'}, ${vendorData.services.join(', ')})`);
      results.imported++;
    } else {
      try {
        // Hash the password before saving
        const salt = await bcrypt.genSalt(12);
        vendorData.password = await bcrypt.hash(tempPassword, salt);

        const vendor = new Vendor(vendorData);
        await vendor.save();
        console.log(`[${results.total}] IMPORTED: "${companyName}" (${vendorData.location.city || 'No city'})`);
        results.imported++;
      } catch (error) {
        console.error(`[${results.total}] ERROR: "${companyName}" - ${error.message}`);
        results.errors.push({
          row: results.total,
          companyName,
          error: error.message
        });
      }
    }
  }

  console.log('\n========================================');
  console.log('         IMPORT COMPLETE');
  console.log('========================================');
  console.log(`Total rows processed: ${results.total}`);
  console.log(`Successfully imported: ${results.imported}`);
  console.log(`Skipped (existing/empty): ${results.skipped}`);
  console.log(`Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.slice(0, 10).forEach(e => {
      console.log(`  Row ${e.row}: ${e.companyName} - ${e.error}`);
    });
    if (results.errors.length > 10) {
      console.log(`  ... and ${results.errors.length - 10} more errors`);
    }
  }

  console.log('\n');
  await mongoose.disconnect();
  return results;
}

// Run if called directly
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--')) || './data/vendors.xlsx';
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

if (!args.find(a => !a.startsWith('--'))) {
  console.log('Usage: node scripts/importVendors.js <file.xlsx> [--dry-run] [--limit=N]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run    Show what would be imported without saving');
  console.log('  --limit=N    Only process first N rows');
  console.log('');
  console.log('Expected Excel columns (flexible naming):');
  console.log('  company_name, email, phone, website, address, city, postcode,');
  console.log('  region, coverage, services, brands, years_in_business,');
  console.log('  company_size, certifications, accreditations');
  process.exit(1);
}

importVendors(filePath, { dryRun, limit })
  .then((results) => {
    process.exit(results.errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('\nImport failed:', err.message);
    process.exit(1);
  });

export default importVendors;
